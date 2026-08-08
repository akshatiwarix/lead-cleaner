import { describe, expect, it } from "vitest";
import { clean, quarantineReason } from "./run.ts";
import { DEFAULT_CONFIG } from "./config.ts";
import { contentHash } from "./hash.ts";
import { summarise } from "./metrics.ts";
import { demoRows } from "../../data/leads.ts";
import { normalizeOne, shuffled } from "../match/test-support.ts";

const rows = demoRows();
const result = clean(rows, DEFAULT_CONFIG);
const clusterOf = (id: string) => result.clusters.find((cluster) => cluster.memberIds.includes(id));

describe("quarantine", () => {
  it("holds a row with no way to identify a person, and says why", () => {
    for (const id of ["r061", "r062", "r063", "r064", "r065", "r066"]) {
      const held = result.quarantined.find((item) => item.id === id);
      expect(held, id).toBeDefined();
      expect(held!.reason).toContain("no way to identify a person");
    }
  });

  it("lets a row through on any one identifier", () => {
    expect(quarantineReason(normalizeOne("r1", { email: "bob@acme.example" }))).toBeUndefined();
    expect(quarantineReason(normalizeOne("r2", { phone: "(555) 019-2837" }))).toBeUndefined();
    expect(quarantineReason(normalizeOne("r3", { fullName: "Bob Reyes", company: "Acme" }))).toBeUndefined();
  });

  it("holds a shared inbox with nothing else, and names it as the reason", () => {
    const reason = quarantineReason(normalizeOne("r1", { email: "info@acme.example" }));
    expect(reason).toContain("shared inbox");
  });

  it("does not hold a row that has a shared inbox plus a name and company", () => {
    // The role address contributes nothing, but the rest of the row is identifiable.
    expect(
      quarantineReason(normalizeOne("r1", { fullName: "Ana Silva", email: "info@acme.example", company: "Grupo Solar" })),
    ).toBeUndefined();
  });
});

/**
 * The accounting invariant. A file goes in with 150 rows; a file has to come out
 * with 150 rows. Silently dropping rows is the worst failure mode in this category
 * of tool, because the loss is invisible.
 */
describe("no row disappears", () => {
  it("accounts for every input row exactly once", () => {
    const clustered = result.clusters.flatMap((cluster) => cluster.memberIds);
    const held = result.quarantined.map((item) => item.id);
    const all = [...clustered, ...held].sort();

    expect(all).toHaveLength(rows.length);
    expect(new Set(all).size).toBe(rows.length);
    expect(all).toEqual(rows.map((row) => row.id).sort());
  });

  it("keeps quarantined rows out of the clusters, so nothing is counted twice", () => {
    for (const held of result.quarantined) expect(clusterOf(held.id)).toBeUndefined();
  });
});

/**
 * The claim the whole design is arranged around: the automatic tier does not make
 * false merges. A missed merge is a review item; a false merge is a person's record,
 * gone. If this fails, an authoritative rule is wrong — the rule gets fixed, not
 * the test.
 */
describe("the automatic tier holds precision 1.0", () => {
  it("merges no two rows that belong to different people", () => {
    const truth = new Map(rows.map((row) => [row.id, row.truePersonId]));
    const wrong: string[] = [];

    for (const cluster of result.clusters) {
      for (let i = 0; i < cluster.memberIds.length; i++) {
        for (let j = i + 1; j < cluster.memberIds.length; j++) {
          const [a, b] = [cluster.memberIds[i], cluster.memberIds[j]];
          if (truth.get(a) !== truth.get(b)) wrong.push(`${a} (${truth.get(a)}) with ${b} (${truth.get(b)})`);
        }
      }
    }

    expect(wrong).toEqual([]);
    expect(result.metrics.groundTruth?.autoPrecision).toBe(1);
  });

  it("finds nearly every true duplicate, and the rest are in the queue", () => {
    const truth = result.metrics.groundTruth!;
    expect(truth.autoRecall).toBeGreaterThan(0.9);
    // The pairs it did not merge are the ones it is asking about, not ones it lost.
    expect(truth.withReviewRecall).toBe(1);
  });

  it("is calibrated so the default queue is safe to accept, and lowering it is not", () => {
    // This is what the sweep bought. At the shipped threshold the queue contains
    // only real duplicates, so a reviewer who accepts all of it lands on perfect
    // precision and perfect recall — the default asks for the least work that still
    // reaches a complete answer.
    expect(result.metrics.groundTruth!.withReviewPrecision).toBe(1);
    expect(result.metrics.groundTruth!.withReviewRecall).toBe(1);

    // Lower it and the queue starts including pairs that have to be rejected. The
    // number falling is the whole reason the queue is a queue and not an automatic
    // merge — and it is what dragging the slider in the UI shows.
    const loose = clean(rows, { ...DEFAULT_CONFIG, reviewThreshold: 0.6 });
    expect(loose.metrics.pendingReview).toBeGreaterThan(result.metrics.pendingReview);
    expect(loose.metrics.groundTruth!.withReviewPrecision).toBeLessThan(1);

    // What does not move: the automatic tier never reads the threshold.
    expect(loose.metrics.groundTruth!.autoPrecision).toBe(1);
    expect(loose.metrics.autoMerged).toBe(result.metrics.autoMerged);
  });
});

describe("survivorship over the dataset", () => {
  it("keeps a phone the newer, emptier row dropped", () => {
    const cluster = clusterOf("r039")!;
    expect(cluster.memberIds).toEqual(["r039", "r040"]);
    expect(cluster.provenance.phone?.winnerId).toBe("r039");
    expect(cluster.canonical.phone).toBe("+15550191019");
  });

  it("prefers a trusted source over a more recent untrusted one", () => {
    const cluster = clusterOf("r041")!;
    expect(cluster.provenance.company?.winnerId).toBe("r041");
    expect(cluster.provenance.company?.rule).toContain("most trusted source");
    expect(cluster.provenance.company?.conflicts[0].value).toBe("Vega Logistica");
  });

  it("flags a title two sources disagree about", () => {
    const cluster = clusterOf("r037")!;
    expect(cluster.conflictCount).toBeGreaterThan(0);
    expect(cluster.provenance.title?.conflicts.map((conflict) => conflict.value)).toContain(
      "VP Revenue Operations",
    );
  });

  it("flags the company conflict on a job change rather than picking silently", () => {
    const cluster = clusterOf("r023")!;
    expect(cluster.memberIds).toEqual(["r023", "r024"]);
    expect(cluster.provenance.company?.conflicts).toHaveLength(1);
  });

  it("hands back an address that was actually in the file", () => {
    // The canonical form is a matching artefact: `b.reyes+list@` canonicalises to
    // `breyes@`, and an export containing an address nobody wrote is worse than one
    // containing the wrong row's. So every surviving value has to be a value that
    // appeared in the input, chosen by the chain rather than synthesised.
    const written = new Set(
      rows.flatMap((row) => (row.mapped.email === undefined ? [] : [row.mapped.email.trim().toLowerCase()])),
    );
    for (const cluster of result.clusters) {
      if (cluster.canonical.email === undefined) continue;
      expect(written.has(cluster.canonical.email), `${cluster.id}: ${cluster.canonical.email}`).toBe(true);
    }

    // And which of two written forms survives is the chain's decision: the CRM
    // export outranks the event list, so r004's spelling wins over r003's.
    const cluster = clusterOf("r003")!;
    expect(cluster.memberIds).toEqual(["r003", "r004"]);
    expect(cluster.canonical.email).toBe("breyes@mailbox.example");
    expect(cluster.provenance.email?.rule).toContain("most trusted source");
    expect(cluster.provenance.email?.conflicts[0].value).toBe("b.reyes@mailbox.example");
  });

  it("rebuilds a display name rather than passing one through", () => {
    expect(clusterOf("r015")!.canonical.fullName).toBe("Diego Morales");
    expect(clusterOf("r019")!.canonical.fullName).toBe("Priya Raman");
  });
});

describe("the run is identified by its inputs", () => {
  it("hashes the same inputs to the same value", () => {
    expect(clean(rows, DEFAULT_CONFIG).runHash).toBe(result.runHash);
  });

  it("changes when the config changes", () => {
    expect(clean(rows, { ...DEFAULT_CONFIG, reviewThreshold: 0.9 }).runHash).not.toBe(result.runHash);
  });

  it("changes when a constraint is added, but not when they are reordered", () => {
    const constraints = [
      { kind: "link" as const, a: "r011", b: "r012", by: "human" as const },
      { kind: "must-not-link" as const, a: "r001", b: "r002", by: "human" as const },
    ];
    const withConstraints = clean(rows, DEFAULT_CONFIG, constraints);
    expect(withConstraints.runHash).not.toBe(result.runHash);
    expect(clean(rows, DEFAULT_CONFIG, [...constraints].reverse()).runHash).toBe(withConstraints.runHash);
  });

  it("hashes structurally equal objects identically however they were built", () => {
    expect(contentHash({ a: 1, b: [2, 3] })).toBe(contentHash({ b: [2, 3], a: 1 }));
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
  });
});

/**
 * Order independence, end to end. The match stage has its own version of this test;
 * this one covers the whole pipeline including survivorship, where the id tiebreak
 * and the conflict lists are the parts that could leak row order into the output.
 */
describe("shuffled input produces byte-identical output", () => {
  it("holds for the full result", () => {
    const backward = clean(shuffled(rows), DEFAULT_CONFIG);
    expect(JSON.stringify(backward)).toBe(JSON.stringify(result));
  });

  it("holds with constraints applied", () => {
    const constraints = [
      { kind: "link" as const, a: "r011", b: "r012", by: "human" as const },
      { kind: "must-not-link" as const, a: "r025", b: "r027", by: "human" as const },
    ];
    const forward = clean(rows, DEFAULT_CONFIG, constraints);
    const backward = clean(shuffled(rows), DEFAULT_CONFIG, constraints);
    expect(JSON.stringify(backward)).toBe(JSON.stringify(forward));
  });
});

describe("metrics", () => {
  it("reports the counts the README quotes", () => {
    const { metrics } = result;
    expect(metrics.rowsIn).toBe(150);
    expect(metrics.quarantined).toBe(6);
    expect(metrics.clusters + metrics.quarantined).toBeGreaterThan(0);
    expect(metrics.comparisonRatio).toBeLessThan(0.01);
    expect(metrics.skippedBlocks).toEqual([]);
  });

  it("excludes quarantined rows from the dedup rate", () => {
    // Counting them would flatter the number: they never entered matching.
    const clustered = result.clusters.reduce((sum, cluster) => sum + cluster.memberIds.length, 0);
    expect(result.metrics.dedupRate).toBeCloseTo((clustered - result.metrics.clusters) / clustered, 12);
  });

  it("summarises a run in one line", () => {
    expect(summarise(result)).toContain("150 rows");
    expect(summarise(result)).toContain("% of exhaustive");
  });

  it("omits the ground-truth block when the rows are unlabelled", () => {
    const unlabelled = rows.map((row) => ({ ...row, truePersonId: undefined }));
    expect(clean(unlabelled, DEFAULT_CONFIG).metrics.groundTruth).toBeUndefined();
  });
});

describe("configuration changes the outcome", () => {
  it("empties the review queue as the threshold rises", () => {
    const strict = clean(rows, { ...DEFAULT_CONFIG, reviewThreshold: 0.99 });
    expect(strict.metrics.pendingReview).toBe(0);
    // And the automatic merges are untouched: the threshold only governs review.
    expect(strict.metrics.autoMerged).toBe(result.metrics.autoMerged);
  });

  it("finds the same merges with blocking off", () => {
    // The exhaustive comparator is the baseline. Same clusters, far more work.
    const exhaustive = clean(rows, { ...DEFAULT_CONFIG, blocking: false });
    expect(JSON.stringify(exhaustive.clusters)).toBe(JSON.stringify(result.clusters));
    expect(exhaustive.metrics.comparisons).toBeGreaterThan(result.metrics.comparisons * 50);
  });

  it("reports skipped blocks when the cap is lowered", () => {
    const capped = clean(rows, { ...DEFAULT_CONFIG, maxBlockSize: 3 });
    expect(capped.metrics.skippedBlocks.length).toBeGreaterThan(0);
  });

  it("handles an empty input without inventing anything", () => {
    const empty = clean([], DEFAULT_CONFIG);
    expect(empty.clusters).toEqual([]);
    expect(empty.metrics.rowsIn).toBe(0);
    expect(empty.metrics.dedupRate).toBe(0);
    expect(empty.metrics.comparisonRatio).toBe(1);
  });
});
