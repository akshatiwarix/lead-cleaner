import { describe, expect, it } from "vitest";
import { soundex } from "./phonetic.ts";

describe("soundex", () => {
  it("matches the canonical reference values", () => {
    expect(soundex("Robert")).toBe("R163");
    expect(soundex("Rupert")).toBe("R163");
    expect(soundex("Ashcraft")).toBe("A261");
    expect(soundex("Ashcroft")).toBe("A261");
    expect(soundex("Tymczak")).toBe("T522");
    expect(soundex("Pfister")).toBe("P236");
    expect(soundex("Honeyman")).toBe("H555");
  });

  it("applies the H/W transparency rule", () => {
    // The rule most implementations miss: the S and C either side of the H
    // collapse to one 2, giving A261 rather than A226.
    expect(soundex("Ashcraft")).toBe("A261");
    // Two identical codes separated by a vowel do *not* collapse.
    expect(soundex("Tymczak")).toBe("T522");
  });

  it("pads short names and truncates long ones", () => {
    expect(soundex("Lee")).toBe("L000");
    expect(soundex("Wu")).toBe("W000");
    expect(soundex("Washington")).toBe("W252");
  });

  it("ignores case, punctuation and spacing", () => {
    expect(soundex("o'brien")).toBe(soundex("OBrien"));
    expect(soundex("Van Dyke")).toBe(soundex("vandyke"));
  });

  it("returns nothing for input with no letters", () => {
    expect(soundex("")).toBe("");
    expect(soundex("---")).toBe("");
    expect(soundex("42")).toBe("");
  });

  it("groups a substituted letter with the name it misspells", () => {
    // What the key is for: putting a misspelling in the same bucket as the name
    // it misspells, so the pair gets compared at all.
    expect(soundex("Reyes")).toBe(soundex("Reyez"));
    expect(soundex("Ashcraft")).toBe(soundex("Ashcroft"));
  });

  it("misses the recall cases it is documented to miss", () => {
    // Known holes, not bugs, and worth pinning so nobody assumes otherwise:
    //
    //   - a different first letter starts a different block entirely
    //   - a dropped trailing consonant shifts the padding, so `Okafo` and
    //     `Okafor` land apart
    //
    // Multi-key blocking is what covers these — the company+initial and
    // domain+surname keys still bring both pairs together — and
    // lib/match/blocking.test.ts bounds whatever recall is left on the floor by
    // comparing against the exhaustive comparator.
    expect(soundex("Chen")).not.toBe(soundex("Shen"));
    expect(soundex("Okafor")).not.toBe(soundex("Okafo"));
  });
});
