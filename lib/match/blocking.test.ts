import { describe, expect, it } from "vitest";
import { blockKeysFor, candidatePairs, pairKey } from "./blocking.ts";
import { CONFIG, normalizeOne, records, shuffled } from "./test-support.ts";
import { scorePair } from "./rules.ts";
import { mustNotLinkSet, refusalFor } from "./refuse.ts";

describe("blockKeysFor", () => {
  it("keys a full record on every axis it has evidence for", () => {
    const record = normalizeOne("r1", {
      fullName: "Bob Reyes",
      email: "b.reyes@acme.example",
      phone: "(555) 019-2837",
      company: "Acme, Inc.",
    });
    const kinds = blockKeysFor(record).map((key) => key.split(":")[0]);
    expect(new Set(kinds)).toEqual(
      new Set(["email", "local", "phone7", "sound-company", "domain-name", "company-initial", "name"]),
    );
  });

  it("gives no mailbox key to a shared inbox", () => {
    // A role address must not put every person behind it in one block — the block
    // is where the false merge would start.
    const role = normalizeOne("r1", { fullName: "Ana Silva", email: "info@acme.example" });
    expect(blockKeysFor(role).some((key) => key.startsWith("email:"))).toBe(false);
  });

  it("keys a personal mailbox on its local part, so one person at two domains is compared", () => {
    // Being compared is the prerequisite for being refused.
    const left = normalizeOne("r1", { fullName: "Bob Reyes", email: "b.reyes@apex.example" });
    const right = normalizeOne("r2", { fullName: "Bob Reyes", email: "b.reyes@nordwind.example" });
    expect(blockKeysFor(left)).toContain("local:b.reyes");
    expect(blockKeysFor(right)).toContain("local:b.reyes");
  });

  it("keys on the subscriber number, so a missing country code still blocks together", () => {
    const withCode = normalizeOne("r1", { phone: "+1 555 019 2837" });
    const without = normalizeOne("r2", { phone: "555-019-2837" });
    expect(blockKeysFor(withCode)).toContain("phone7:0192837");
    expect(blockKeysFor(without)).toContain("phone7:0192837");
  });

  it("resolves a nickname in the name key, so Bob and Robert share a block", () => {
    const bob = normalizeOne("r1", { fullName: "Bob Reyes" });
    const robert = normalizeOne("r2", { fullName: "Robert Reyes" });
    expect(blockKeysFor(bob)).toContain("name:robert|reyes");
    expect(blockKeysFor(robert)).toContain("name:robert|reyes");
  });
});

describe("candidatePairs", () => {
  it("cuts the comparison count substantially", () => {
    const result = candidatePairs(records(), CONFIG);
    expect(result.exhaustive).toBe((150 * 149) / 2);
    // The saving is the reason blocking exists; the next test is the reason it is
    // safe. Both numbers are reported in the metrics so neither travels alone.
    expect(result.comparisons).toBeLessThan(result.exhaustive / 10);
  });

  it("produces canonical, unique, sorted pairs", () => {
    const { pairs } = candidatePairs(records(), CONFIG);
    const keys = pairs.map(([a, b]) => pairKey(a, b));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([...keys].sort());
    for (const [a, b] of pairs) expect(a < b).toBe(true);
  });

  it("does not depend on the order the records arrived in", () => {
    const forward = candidatePairs(records(), CONFIG);
    const backward = candidatePairs(shuffled(records()), CONFIG);
    expect(backward.pairs).toEqual(forward.pairs);
  });

  it("compares everything when blocking is off", () => {
    const result = candidatePairs(records(), { ...CONFIG, blocking: false });
    expect(result.comparisons).toBe(result.exhaustive);
    expect(result.skippedBlocks).toEqual([]);
  });

  it("reports an oversized block instead of expanding it", () => {
    const result = candidatePairs(records(), { ...CONFIG, maxBlockSize: 3 });
    expect(result.skippedBlocks.length).toBeGreaterThan(0);
    expect(result.comparisons).toBeLessThan(candidatePairs(records(), CONFIG).comparisons);
    // Silent truncation is the failure mode this guards against: the caller has to
    // be able to see that coverage was reduced.
    for (const skipped of result.skippedBlocks) expect(skipped.size).toBeGreaterThan(3);
  });
});

/**
 * The invariant that makes blocking defensible.
 *
 * Blocking is a bet that no true duplicate shares zero keys. This test settles the
 * bet on the bundled dataset by running the exhaustive comparator and checking that
 * every pair it would have accepted or sent to review is also reachable under
 * blocking. If it ever fails, the answer is another blocking key — not a lower
 * threshold, and not a smaller claim in the README.
 */
describe("blocking loses nothing the exhaustive comparator would find", () => {
  const all = records();
  const byId = new Map(all.map((record) => [record.id, record]));
  const empty = mustNotLinkSet([]);

  function interesting(config = CONFIG) {
    const { pairs } = candidatePairs(all, { ...config, blocking: false });
    return pairs.filter(([a, b]) => {
      const left = byId.get(a)!;
      const right = byId.get(b)!;
      if (refusalFor(left, right, empty) !== undefined) return false;
      const edge = scorePair(left, right, config.nameGate);
      return edge.kind === "authoritative" || edge.score >= config.reviewThreshold;
    });
  }

  it("finds every pair the full sweep would have merged or reviewed", () => {
    const blocked = new Set(candidatePairs(all, CONFIG).pairs.map(([a, b]) => pairKey(a, b)));
    const missed = interesting()
      .map(([a, b]) => pairKey(a, b))
      .filter((key) => !blocked.has(key));

    expect(missed).toEqual([]);
  });

  it("finds every refusal that is actually preventing something", () => {
    // Most refusals are uninteresting: "different corporate mailboxes at different
    // employers" is true of nearly every unrelated pair in the file, and demanding
    // that blocking reach all of them is demanding the exhaustive sweep.
    //
    // The refusals worth reaching are the ones doing work — pairs that would have
    // merged or gone to review if the refusal had not fired. Those must be
    // compared, because a refusal nobody sees cannot appear in the audit trail and
    // the pair it was protecting would merge instead.
    const blocked = new Set(candidatePairs(all, CONFIG).pairs.map(([a, b]) => pairKey(a, b)));
    const { pairs } = candidatePairs(all, { ...CONFIG, blocking: false });

    const loadBearing = pairs.filter(([a, b]) => {
      const left = byId.get(a)!;
      const right = byId.get(b)!;
      if (refusalFor(left, right, empty) === undefined) return false;
      const edge = scorePair(left, right, CONFIG.nameGate);
      return edge.kind === "authoritative" || edge.score >= CONFIG.reviewThreshold;
    });

    expect(loadBearing.length).toBeGreaterThan(0);
    expect(loadBearing.map(([a, b]) => pairKey(a, b)).filter((key) => !blocked.has(key))).toEqual([]);
  });

  it("still holds at a much lower review threshold", () => {
    // A user dragging the threshold down must not silently fall off the end of
    // what blocking can see.
    const blocked = new Set(candidatePairs(all, CONFIG).pairs.map(([a, b]) => pairKey(a, b)));
    const missed = interesting({ ...CONFIG, reviewThreshold: 0.6 })
      .map(([a, b]) => pairKey(a, b))
      .filter((key) => !blocked.has(key));

    expect(missed).toEqual([]);
  });
});
