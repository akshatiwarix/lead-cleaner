/**
 * The matching stage, assembled: block, refuse, score, constrain, cluster.
 *
 * The order is the design and it is not negotiable. Refusals run before scoring so
 * that no amount of agreement can overrule them. Human decisions arrive as
 * constraints — an *input*, not UI state — so the same rows with the same
 * decisions always produce the same clusters, whoever runs it.
 *
 * A reviewer can also link a pair blocking never proposed. That edge is
 * constructed here rather than discovered, because a human looking at two rows is
 * better evidence than any key this file could have computed.
 */

import type { CleanConfig, Constraint, Edge, NormalizedRecord } from "../clean/types.ts";
import { candidatePairs, pairKey, orderedPair } from "./blocking.ts";
import { clusterRecords, type RawCluster } from "./cluster.ts";
import { mustNotLinkSet, refusalFor } from "./refuse.ts";
import { scorePair } from "./rules.ts";

export type MatchResult = {
  clusters: RawCluster[];
  /** Probable pairs above the threshold that no human has ruled on yet. */
  review: Edge[];
  /** Everything refused: by rule, by a reviewer, or by a constraint at union time. */
  refused: Edge[];
  comparisons: number;
  exhaustive: number;
  skippedBlocks: { key: string; size: number }[];
  /** Probable pairs that scored below the threshold. Kept for the sweep. */
  belowThreshold: Edge[];
};

export function matchRecords(
  records: NormalizedRecord[],
  config: CleanConfig,
  constraints: Constraint[],
): MatchResult {
  const byId = new Map(records.map((record) => [record.id, record]));
  const mustNotLink = mustNotLinkSet(constraints);

  const humanLinks = constraints.filter((constraint) => constraint.kind === "link");
  const humanLinked = new Set(humanLinks.map((constraint) => pairKey(constraint.a, constraint.b)));

  const { pairs, comparisons, exhaustive, skippedBlocks } = candidatePairs(records, config);

  const accepted: Edge[] = [];
  const review: Edge[] = [];
  const refused: Edge[] = [];
  const belowThreshold: Edge[] = [];
  const scored = new Set<string>();

  for (const [a, b] of pairs) {
    const left = byId.get(a);
    const right = byId.get(b);
    if (left === undefined || right === undefined) continue;
    scored.add(pairKey(a, b));

    const refusal = refusalFor(left, right, mustNotLink);
    if (refusal !== undefined) {
      refused.push({ a, b, kind: "refused", score: 0, reasons: [refusal] });
      continue;
    }

    const edge = scorePair(left, right, config.nameGate);

    if (edge.kind === "authoritative") {
      accepted.push(edge);
      continue;
    }

    // A reviewer's `link` promotes a probable pair, whatever it scored.
    if (humanLinked.has(pairKey(a, b))) {
      accepted.push({ ...edge, kind: "authoritative" });
      continue;
    }

    if (edge.score >= config.reviewThreshold) review.push(edge);
    else belowThreshold.push(edge);
  }

  // A reviewer can join two rows blocking never brought together. Scored here so
  // the edge still carries its reasons into the audit trail.
  for (const link of humanLinks) {
    const key = pairKey(link.a, link.b);
    if (scored.has(key)) continue;

    const [a, b] = orderedPair(link.a, link.b);
    const left = byId.get(a);
    const right = byId.get(b);
    if (left === undefined || right === undefined) continue;

    const edge = scorePair(left, right, config.nameGate);
    accepted.push({
      ...edge,
      kind: "authoritative",
      reasons: [
        ...edge.reasons,
        {
          rule: "reviewer linked these rows",
          verdict: "match",
          detail: "blocking never proposed this pair; a human looking at both rows did",
        },
      ],
    });
  }

  const clustered = clusterRecords(
    records.map((record) => record.id),
    accepted,
    mustNotLink,
    humanLinked,
  );

  const sortByPair = (left: Edge, right: Edge) =>
    pairKey(left.a, left.b).localeCompare(pairKey(right.a, right.b));

  // A probable pair whose rows already ended up in one cluster — reached through
  // some other authoritative edge — is not a decision anyone needs to make. The
  // three-row clusters produce these: two rows joined via a third still score as a
  // probable pair against each other. Asking about it would be busywork, and the
  // edge is already in the cluster's own audit trail.
  const clusterOf = new Map<string, string>();
  for (const cluster of clustered.clusters) {
    for (const id of cluster.memberIds) clusterOf.set(id, cluster.id);
  }
  const stillOpen = (edge: Edge) => clusterOf.get(edge.a) !== clusterOf.get(edge.b);

  return {
    clusters: clustered.clusters,
    // Highest score first: the review queue should open on the pair most likely to
    // be a real duplicate.
    review: review
      .filter(stillOpen)
      .sort((left, right) => right.score - left.score || sortByPair(left, right)),
    refused: [...refused, ...clustered.refused].sort(sortByPair),
    comparisons,
    exhaustive,
    skippedBlocks,
    belowThreshold: belowThreshold.sort((left, right) => right.score - left.score || sortByPair(left, right)),
  };
}
