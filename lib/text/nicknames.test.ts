import { describe, expect, it } from "vitest";
import { jaroWinkler } from "./jaro-winkler.ts";
import { firstNameCompatibility, isInitial, isKnown, nameGroups } from "./nicknames.ts";

describe("nameGroups", () => {
  it("maps a short form to every formal name it could stand for", () => {
    expect([...nameGroups("sam")].sort()).toEqual(["samantha", "samson", "samuel"]);
    expect([...nameGroups("bob")]).toEqual(["robert"]);
  });

  it("maps a formal name to itself", () => {
    expect([...nameGroups("robert")]).toEqual(["robert"]);
  });

  it("lets an unknown name stand only for itself", () => {
    // The table's silence is not evidence. An unfamiliar name gets no free
    // connections — it falls through to string similarity instead.
    expect([...nameGroups("adaeze")]).toEqual(["adaeze"]);
  });

  it("ignores case and trailing punctuation", () => {
    expect([...nameGroups("Bob")]).toEqual(["robert"]);
    expect([...nameGroups(" bob ")]).toEqual(["robert"]);
  });
});

describe("isKnown", () => {
  it("reports whether the table has an opinion at all", () => {
    expect(isKnown("Robert")).toBe(true);
    expect(isKnown("bob")).toBe(true);
    expect(isKnown("Adaeze")).toBe(false);
  });
});

describe("isInitial", () => {
  it("recognises one letter, with or without a period", () => {
    expect(isInitial("J")).toBe(true);
    expect(isInitial("J.")).toBe(true);
    expect(isInitial(" j. ")).toBe(true);
  });

  it("does not treat a short name as an initial", () => {
    expect(isInitial("Jo")).toBe(false);
    expect(isInitial("Wu")).toBe(false);
    expect(isInitial("")).toBe(false);
  });
});

describe("firstNameCompatibility", () => {
  it("scores identical names at 1", () => {
    expect(firstNameCompatibility("Robert", "robert").score).toBe(1);
  });

  it("connects a nickname to its formal name", () => {
    const result = firstNameCompatibility("Bob", "Robert");
    expect(result.score).toBe(0.95);
    expect(result.rule).toBe("both are forms of robert");
  });

  it("keeps an ambiguous short form compatible with each of its formal names", () => {
    expect(firstNameCompatibility("Sam", "Samuel").score).toBe(0.95);
    expect(firstNameCompatibility("Sam", "Samantha").score).toBe(0.95);
    expect(firstNameCompatibility("Alex", "Alexander").score).toBe(0.95);
    expect(firstNameCompatibility("Alex", "Alexandra").score).toBe(0.95);
  });

  it("keeps two formal names that merely share a short form apart", () => {
    // The reason a name maps to a set rather than to one canonical form. A
    // single-canonical table would put both of these under `samuel` and score
    // them as near-matches. The cap is 0.4 — below the 0.80 name gate, so no
    // such pair can merge, but non-zero so other evidence still composes.
    for (const [a, b] of [
      ["Samuel", "Samantha"],
      ["Alexander", "Alexandra"],
      ["Christopher", "Christina"],
      ["Patrick", "Patricia"],
      ["Jonathan", "John"],
    ] as const) {
      const result = firstNameCompatibility(a, b);
      expect(result.score, `${a} vs ${b}`).toBe(0.4);
      expect(result.rule).toContain("different formal given names");
    }
  });

  it("does not let Jaro-Winkler's prefix boost reunite a gendered pair", () => {
    // Without the known-but-disjoint cap these fall through to string
    // similarity, where a long shared stem plus the prefix boost puts them at
    // 0.96 — above the name gate, and wrong.
    expect(jaroWinkler("alexander", "alexandra")).toBeGreaterThan(0.95);
    expect(firstNameCompatibility("Alexander", "Alexandra").score).toBeLessThan(0.8);
  });

  it("treats an agreeing initial as compatible but never as equal", () => {
    const result = firstNameCompatibility("J.", "John");
    expect(result.score).toBe(0.85);
    expect(result.rule).toBe("initial J. is consistent with john");
    // The ceiling is the point: `J. Smith` could be the John Smith in the next
    // row or the Jane Smith in the one after.
    expect(result.score).toBeLessThan(firstNameCompatibility("John", "John").score);
  });

  it("refuses an initial that contradicts the name", () => {
    expect(firstNameCompatibility("J.", "Robert").score).toBe(0);
  });

  it("scores two matching initials lowest of all the agreeing cases", () => {
    const both = firstNameCompatibility("J.", "J.");
    expect(both.score).toBe(0.6);
    expect(both.score).toBeLessThan(firstNameCompatibility("J.", "John").score);
    expect(firstNameCompatibility("J.", "R.").score).toBe(0);
  });

  it("falls back to string similarity for names outside the table", () => {
    const typo = firstNameCompatibility("Adaeze", "Adaez");
    expect(typo.rule).toBe("given-name string similarity");
    expect(typo.score).toBeGreaterThan(0.9);

    const different = firstNameCompatibility("Adaeze", "Chioma");
    expect(different.score).toBeLessThan(0.6);
  });

  it("treats a missing name as no evidence rather than as agreement", () => {
    expect(firstNameCompatibility("", "Robert").score).toBe(0);
    expect(firstNameCompatibility("", "").score).toBe(0);
  });

  it("is symmetric", () => {
    const pairs: [string, string][] = [
      ["Bob", "Robert"],
      ["J.", "John"],
      ["Sam", "Samantha"],
      ["Adaeze", "Chioma"],
    ];
    for (const [a, b] of pairs) {
      expect(firstNameCompatibility(a, b).score).toBeCloseTo(firstNameCompatibility(b, a).score, 12);
    }
  });
});
