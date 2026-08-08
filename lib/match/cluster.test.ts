import { describe, expect, it } from "vitest";
import { clusterRecords } from "./cluster.ts";
import { matchRecords } from "./index.ts";
import { pairKey } from "./blocking.ts";
import { CONFIG, records, shuffled } from "./test-support.ts";
import type { Edge } from "../clean/types.ts";

function edge(a: string, b: string, kind: Edge["kind"] = "authoritative", score = 1): Edge {
  return { a, b, kind, score, reasons: [] };
}

describe("clusterRecords", () => {
  it("keeps unmatched records as singletons rather than dropping them", () => {
    const result = clusterRecords(["r1", "r2", "r3"], [], new Set(), new Set());
    expect(result.clusters.map((cluster) => cluster.memberIds)).toEqual([["r1"], ["r2"], ["r3"]]);
    expect(result.clusters.every((cluster) => cluster.strength === "singleton")).toBe(true);
  });

  it("chains a three-row cluster through two different edges", () => {
    // No single edge covers all three rows; transitivity is what finds the third.
    const result = clusterRecords(["r1", "r2", "r3"], [edge("r1", "r2"), edge("r2", "r3")], new Set(), new Set());
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].memberIds).toEqual(["r1", "r2", "r3"]);
  });

  it("stops a chain from swallowing a pair that may not be merged", () => {
    // The failure mode union-find has by default. r1~r2 and r2~r3 are both fine,
    // but r1 and r3 are known to be different people, so the chain must break.
    const mustNotLink = new Set([pairKey("r1", "r3")]);
    const result = clusterRecords(
      ["r1", "r2", "r3"],
      [edge("r1", "r2"), edge("r2", "r3")],
      mustNotLink,
      new Set(),
    );

    expect(result.clusters.map((cluster) => cluster.memberIds)).toEqual([["r1", "r2"], ["r3"]]);
    // And the union that did not happen is recorded, not silently skipped.
    expect(result.refused).toHaveLength(1);
    expect(result.refused[0].reasons.at(-1)?.detail).toContain("r1 and r3");
  });

  it("names a cluster after its lowest member, never after a counter", () => {
    // A counter would renumber every cluster when the input order changed.
    const result = clusterRecords(["r9", "r2", "r5"], [edge("r9", "r2"), edge("r2", "r5")], new Set(), new Set());
    expect(result.clusters[0].id).toBe("c-r2");
  });

  it("does not depend on the order the edges arrive in", () => {
    const forward = clusterRecords(
      ["r1", "r2", "r3", "r4"],
      [edge("r1", "r2"), edge("r3", "r4"), edge("r2", "r3")],
      new Set(),
      new Set(),
    );
    const backward = clusterRecords(
      ["r4", "r3", "r2", "r1"],
      [edge("r2", "r3"), edge("r3", "r4"), edge("r1", "r2")],
      new Set(),
      new Set(),
    );
    expect(backward).toEqual(forward);
  });

  it("marks a cluster by the weakest edge that formed it", () => {
    const humanLinked = new Set([pairKey("r2", "r3")]);
    const result = clusterRecords(
      ["r1", "r2", "r3"],
      [edge("r1", "r2"), edge("r2", "r3")],
      new Set(),
      humanLinked,
    );
    expect(result.clusters[0].strength).toBe("human-linked");
  });

  it("keeps a redundant edge for the audit trail", () => {
    // Three edges, two of which are enough. The third still explains part of why
    // the cluster exists, so it is not thrown away.
    const result = clusterRecords(
      ["r1", "r2", "r3"],
      [edge("r1", "r2"), edge("r2", "r3"), edge("r1", "r3")],
      new Set(),
      new Set(),
    );
    expect(result.clusters[0].edges).toHaveLength(3);
  });

  it("survives a long chain without recursing", () => {
    const ids = Array.from({ length: 2000 }, (_, index) => `r${String(index).padStart(4, "0")}`);
    const edges = ids.slice(1).map((id, index) => edge(ids[index], id));
    const result = clusterRecords(ids, edges, new Set(), new Set());
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].memberIds).toHaveLength(2000);
  });
});

describe("matchRecords over the dataset", () => {
  const result = matchRecords(records(), CONFIG, []);
  const clusterOf = (id: string) => result.clusters.find((cluster) => cluster.memberIds.includes(id))!;

  it("accounts for every input row exactly once", () => {
    const members = result.clusters.flatMap((cluster) => cluster.memberIds);
    expect(members).toHaveLength(150);
    expect(new Set(members).size).toBe(150);
  });

  it("finds the three-row clusters", () => {
    expect(clusterOf("r025").memberIds).toEqual(["r025", "r026", "r027"]);
    expect(clusterOf("r028").memberIds).toEqual(["r028", "r029", "r030"]);
  });

  it("keeps every hard negative apart", () => {
    for (const [a, b] of [
      ["r043", "r044"],
      ["r045", "r046"],
      ["r047", "r048"],
      ["r049", "r050"],
      ["r051", "r052"],
      ["r053", "r054"],
      ["r013", "r055"],
      ["r057", "r058"],
      ["r059", "r060"],
    ] as const) {
      expect(clusterOf(a).id, `${a}/${b}`).not.toBe(clusterOf(b).id);
    }
  });

  it("puts real work in the review queue, sorted by score", () => {
    expect(result.review.length).toBeGreaterThan(0);
    const scores = result.review.map((item) => item.score);
    expect(scores).toEqual([...scores].sort((left, right) => right - left));
    for (const item of result.review) expect(item.score).toBeGreaterThanOrEqual(CONFIG.reviewThreshold);
  });

  it("does not ask about a pair that is already in one cluster", () => {
    // The three-row clusters produce these: two rows joined through a third still
    // score as a probable pair against each other. Asking would be busywork, and
    // the edge is already in the cluster's own audit trail.
    for (const item of result.review) {
      expect(clusterOf(item.a).id, pairKey(item.a, item.b)).not.toBe(clusterOf(item.b).id);
    }
    expect(clusterOf("r028").memberIds).toContain("r029");
  });

  it("records why every refused pair was refused", () => {
    expect(result.refused.length).toBeGreaterThan(0);
    for (const item of result.refused) {
      expect(item.reasons.some((reason) => reason.verdict === "refuse"), pairKey(item.a, item.b)).toBe(true);
    }
  });
});

/**
 * The invariant this whole stage is arranged around.
 *
 * Row order changing merge outcomes is the standard bug in this category of tool,
 * and it is invisible without a test: the output looks plausible either way. It is
 * why block keys are sorted, why pairs are canonically oriented, why accepted edges
 * are sorted before union, why the union re-roots on the lowest id, and why cluster
 * ids come from members rather than a counter. Any one of those slipping breaks
 * this test and nothing else.
 */
describe("order independence", () => {
  const forward = matchRecords(records(), CONFIG, []);
  const backward = matchRecords(shuffled(records()), CONFIG, []);

  it("produces byte-identical clusters from shuffled input", () => {
    expect(JSON.stringify(backward.clusters)).toBe(JSON.stringify(forward.clusters));
  });

  it("produces byte-identical review, refusals and below-threshold pairs", () => {
    expect(JSON.stringify(backward.review)).toBe(JSON.stringify(forward.review));
    expect(JSON.stringify(backward.refused)).toBe(JSON.stringify(forward.refused));
    expect(JSON.stringify(backward.belowThreshold)).toBe(JSON.stringify(forward.belowThreshold));
  });

  it("holds under a constrained union, where order could decide which merge wins", () => {
    // A constrained union is path-dependent: if two candidate unions both conflict
    // with the same constraint, the one tried first succeeds. Sorting the edges is
    // what makes that choice reproducible rather than accidental.
    const constraints = [
      { kind: "must-not-link" as const, a: "r025", b: "r027", by: "human" as const },
      { kind: "link" as const, a: "r011", b: "r012", by: "human" as const },
    ];
    const first = matchRecords(records(), CONFIG, constraints);
    const second = matchRecords(shuffled(records()), CONFIG, [...constraints].reverse());
    expect(JSON.stringify(second.clusters)).toBe(JSON.stringify(first.clusters));
  });
});

describe("constraints are an input, so a run is reproducible by someone else", () => {
  it("accepts a probable pair a reviewer approved", () => {
    const before = matchRecords(records(), CONFIG, []);
    const after = matchRecords(records(), CONFIG, [
      { kind: "link", a: "r011", b: "r012", by: "human" },
    ]);

    expect(before.clusters.find((cluster) => cluster.memberIds.includes("r011"))!.memberIds).toEqual(["r011"]);
    const merged = after.clusters.find((cluster) => cluster.memberIds.includes("r011"))!;
    expect(merged.memberIds).toEqual(["r011", "r012"]);
    expect(merged.strength).toBe("human-linked");
    expect(after.review.some((item) => pairKey(item.a, item.b) === pairKey("r011", "r012"))).toBe(false);
  });

  it("splits an automatic merge a reviewer rejected", () => {
    const after = matchRecords(records(), CONFIG, [
      { kind: "must-not-link", a: "r001", b: "r002", by: "human" },
    ]);
    const cluster = after.clusters.find((item) => item.memberIds.includes("r001"))!;
    expect(cluster.memberIds).toEqual(["r001"]);
    expect(after.refused.some((item) => pairKey(item.a, item.b) === pairKey("r001", "r002"))).toBe(true);
  });

  it("links a pair blocking never proposed", () => {
    // A human looking at two rows is better evidence than any key this code could
    // compute, so the edge is constructed rather than discovered.
    // Two rows with no key in common, so blocking never compares them.
    const after = matchRecords(records(), CONFIG, [
      { kind: "link", a: "r069", b: "r071", by: "human", note: "same person, confirmed by phone" },
    ]);
    const cluster = after.clusters.find((item) => item.memberIds.includes("r069"))!;
    expect(cluster.memberIds).toEqual(["r069", "r071"]);
    expect(cluster.edges[0].reasons.at(-1)?.rule).toBe("reviewer linked these rows");
  });

  it("gives the same answer however the constraints are ordered", () => {
    const constraints = [
      { kind: "link" as const, a: "r011", b: "r012", by: "human" as const },
      { kind: "must-not-link" as const, a: "r001", b: "r002", by: "human" as const },
    ];
    const forward = matchRecords(records(), CONFIG, constraints);
    const backward = matchRecords(records(), CONFIG, [...constraints].reverse());
    expect(JSON.stringify(backward)).toBe(JSON.stringify(forward));
  });
});
