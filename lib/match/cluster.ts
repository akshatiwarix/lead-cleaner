/**
 * Turning accepted pairs into clusters, without letting one bad edge cascade.
 *
 * Union-find is the obvious tool and it has an obvious failure mode: transitivity
 * is unconditional. If A joins B and B joins C, then A joins C — even when A and C
 * are known to be different people. One wrong edge in a chain of ten collapses ten
 * records into one, and that is how a deduplicator does real damage.
 *
 * So the union here is *constrained*. Before two components merge, every
 * must-not-link pair is checked against the members of both sides. A union that
 * would put a refused pair in one cluster does not happen, and the edge that
 * proposed it is recorded as refused rather than dropped in silence — the audit
 * trail has to be able to explain the merge that did not occur.
 *
 * Chaining is a feature when the edges are sound: `Nadia Haddad` appears three
 * times, joined once by mailbox and once by phone line, and no single edge covers
 * all three rows.
 */

import type { Cluster, Edge } from "../clean/types.ts";
import { pairKey } from "./blocking.ts";

/** A cluster before survivorship fills in the canonical record. */
export type RawCluster = Pick<Cluster, "id" | "memberIds" | "strength" | "edges">;

export type ClusterResult = {
  clusters: RawCluster[];
  /** Edges that would have violated a must-not-link constraint. */
  refused: Edge[];
};

/**
 * Union-find with the component members kept alongside, because the
 * must-not-link check needs to ask "who is already in there?" before every union.
 * At the scale this runs at, holding the member lists costs nothing and makes the
 * constraint check direct rather than clever.
 */
class Components {
  private parent = new Map<string, string>();
  private members = new Map<string, string[]>();

  constructor(ids: string[]) {
    for (const id of ids) {
      this.parent.set(id, id);
      this.members.set(id, [id]);
    }
  }

  find(id: string): string {
    let root = id;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // Path compression, iterative — a deep chain is exactly what this structure is
    // built to produce, so recursion here would be a stack risk on real inputs.
    let walk = id;
    while (this.parent.get(walk) !== root) {
      const next = this.parent.get(walk)!;
      this.parent.set(walk, root);
      walk = next;
    }
    return root;
  }

  membersOf(id: string): string[] {
    return this.members.get(this.find(id))!;
  }

  /**
   * Merges the smaller component into the larger, then re-roots deterministically
   * on the lowest id. Which side wins cannot be allowed to depend on insertion
   * order, or the cluster ids would change when the input is shuffled.
   */
  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;

    const merged = [...this.members.get(rootA)!, ...this.members.get(rootB)!].sort();
    const root = merged[0];
    const other = root === rootA ? rootB : rootA;

    this.parent.set(other, root);
    this.parent.set(rootA, root);
    this.parent.set(rootB, root);
    this.parent.set(root, root);
    this.members.delete(other);
    this.members.set(root, merged);
  }

  roots(): string[] {
    return [...this.members.keys()].sort();
  }
}

/**
 * Accepted edges, in a fixed order.
 *
 * Authoritative before human-linked, then by descending score, then by pair key.
 * The order matters because a constrained union is *path-dependent* — if two
 * candidate unions both conflict with the same constraint, which one succeeds
 * depends on which was tried first. Fixing the order makes that choice
 * reproducible instead of accidental.
 */
function sortAccepted(edges: Edge[]): Edge[] {
  const rank = (edge: Edge) => (edge.kind === "authoritative" ? 0 : 1);
  return [...edges].sort(
    (left, right) =>
      rank(left) - rank(right) ||
      right.score - left.score ||
      pairKey(left.a, left.b).localeCompare(pairKey(right.a, right.b)),
  );
}

/**
 * @param ids every record id that should appear in the output, including singletons
 * @param accepted authoritative edges plus any human `link` decisions
 * @param mustNotLink canonical pair keys that may never share a cluster
 * @param humanLinked pair keys that came from a reviewer, so strength can say so
 */
export function clusterRecords(
  ids: string[],
  accepted: Edge[],
  mustNotLink: Set<string>,
  humanLinked: Set<string>,
): ClusterResult {
  const components = new Components([...ids].sort());
  const edgesByRoot = new Map<string, Edge[]>();
  const refused: Edge[] = [];

  for (const edge of sortAccepted(accepted)) {
    const left = components.membersOf(edge.a);
    const right = components.membersOf(edge.b);

    if (components.find(edge.a) === components.find(edge.b)) {
      // Already together — keep the edge for the audit trail, since it is part of
      // why the cluster exists.
      edgesByRoot.set(components.find(edge.a), [
        ...(edgesByRoot.get(components.find(edge.a)) ?? []),
        edge,
      ]);
      continue;
    }

    const violation = left.flatMap((a) => right.map((b) => pairKey(a, b))).find((key) => mustNotLink.has(key));

    if (violation !== undefined) {
      refused.push({
        ...edge,
        kind: "refused",
        reasons: [
          ...edge.reasons,
          {
            rule: "blocked by a must-not-link constraint",
            verdict: "refuse",
            detail: `merging these clusters would put ${violation.replace("|", " and ")} together, and that pair is marked as different people`,
          },
        ],
      });
      continue;
    }

    const carried = [...(edgesByRoot.get(components.find(edge.a)) ?? []), ...(edgesByRoot.get(components.find(edge.b)) ?? []), edge];
    edgesByRoot.delete(components.find(edge.a));
    edgesByRoot.delete(components.find(edge.b));
    components.union(edge.a, edge.b);
    edgesByRoot.set(components.find(edge.a), carried);
  }

  const clusters: RawCluster[] = components.roots().map((root) => {
    const members = components.membersOf(root);
    const edges = (edgesByRoot.get(root) ?? []).sort((left, right) =>
      pairKey(left.a, left.b).localeCompare(pairKey(right.a, right.b)),
    );

    const strength: RawCluster["strength"] =
      members.length === 1
        ? "singleton"
        : edges.some((edge) => humanLinked.has(pairKey(edge.a, edge.b)))
          ? "human-linked"
          : "authoritative";

    // The id comes from the lowest member, never from a counter — a counter would
    // renumber every cluster when the input order changed.
    return { id: `c-${members[0]}`, memberIds: members, strength, edges };
  });

  return {
    clusters: clusters.sort((left, right) => left.id.localeCompare(right.id)),
    refused: refused.sort((left, right) =>
      pairKey(left.a, left.b).localeCompare(pairKey(right.a, right.b)),
    ),
  };
}
