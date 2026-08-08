import { describe, expect, it } from "vitest";
import { tokenSetSimilarity, tokenize } from "./token-set.ts";

describe("tokenize", () => {
  it("splits on whitespace and drops the gaps", () => {
    expect(tokenize("  acme   global  holdings ")).toEqual(["acme", "global", "holdings"]);
    expect(tokenize("")).toEqual([]);
  });
});

describe("tokenSetSimilarity", () => {
  it("ignores token order", () => {
    const forward = tokenSetSimilarity("acme global holdings", "global holdings acme");
    expect(forward.score).toBe(1);
    expect(forward.containment).toBe(1);
  });

  it("tolerates a typo inside a token", () => {
    const result = tokenSetSimilarity("acme corp", "acmee corp");
    expect(result.score).toBeGreaterThan(0.9);
    expect(result.pairs).toHaveLength(2);
  });

  it("refuses to pair different words that merely share letters", () => {
    // The case this threshold exists for: two real staffing firms, one token
    // apart. Pairing `acme` with `apex` would make them look like one company.
    const result = tokenSetSimilarity("acme systems", "apex systems");
    expect(result.pairs.map((pair) => pair.a)).toEqual(["systems"]);
    expect(result.score).toBe(0.5);
  });

  it("scores a subset weakly, and reports containment separately", () => {
    const result = tokenSetSimilarity("acme", "acme global holdings");
    expect(result.score).toBeCloseTo(1 / 3, 6);
    expect(result.containment).toBe(1);
  });

  it("is symmetric in score", () => {
    const forward = tokenSetSimilarity("acme", "acme global holdings");
    const backward = tokenSetSimilarity("acme global holdings", "acme");
    expect(forward.score).toBeCloseTo(backward.score, 12);
    expect(forward.containment).toBeCloseTo(backward.containment, 12);
  });

  it("does not depend on the order tokens arrived in", () => {
    // Order independence starts here: a greedy pairing over an unsorted bag
    // could pick different partners depending on input order, and that would
    // travel all the way to the cluster output.
    const a = tokenSetSimilarity("north star data works", "data works north star");
    const b = tokenSetSimilarity("star north works data", "works data star north");
    expect(a.score).toBeCloseTo(b.score, 12);
  });

  it("never pairs one token twice", () => {
    const result = tokenSetSimilarity("data data works", "data works");
    // Deduped to {data, works} on both sides, so two pairs and a perfect score.
    expect(result.pairs).toHaveLength(2);
    expect(result.score).toBe(1);
  });

  it("treats an empty side as no evidence", () => {
    expect(tokenSetSimilarity("", "acme").score).toBe(0);
    expect(tokenSetSimilarity("acme", "").containment).toBe(0);
  });
});
