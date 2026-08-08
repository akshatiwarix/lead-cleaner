import { describe, expect, it } from "vitest";
import { jaro, jaroWinkler } from "./jaro-winkler.ts";

/**
 * The published reference values are here on purpose. A hand-rolled similarity
 * function that nobody checked against the literature is just a number
 * generator, and every threshold in this project is calibrated against these.
 */
describe("jaro", () => {
  it("matches the reference values from the literature", () => {
    // Winkler's own worked examples.
    expect(jaro("martha", "marhta")).toBeCloseTo(0.944, 3);
    expect(jaro("dixon", "dicksonx")).toBeCloseTo(0.767, 3);
    expect(jaro("dwayne", "duane")).toBeCloseTo(0.822, 3);
    expect(jaro("crate", "trace")).toBeCloseTo(0.733, 3);
  });

  it("is 1 for identical strings and 0 when nothing matches", () => {
    expect(jaro("okafor", "okafor")).toBe(1);
    expect(jaro("abc", "xyz")).toBe(0);
  });

  it("is symmetric", () => {
    expect(jaro("reyes", "reyez")).toBeCloseTo(jaro("reyez", "reyes"), 12);
    expect(jaro("dixon", "dicksonx")).toBeCloseTo(jaro("dicksonx", "dixon"), 12);
  });

  it("treats an empty string as agreeing with nothing", () => {
    expect(jaro("", "")).toBe(1);
    expect(jaro("chen", "")).toBe(0);
    expect(jaro("", "chen")).toBe(0);
  });
});

describe("jaroWinkler", () => {
  it("matches the reference values from the literature", () => {
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.961, 3);
    expect(jaroWinkler("dixon", "dicksonx")).toBeCloseTo(0.813, 3);
    expect(jaroWinkler("dwayne", "duane")).toBeCloseTo(0.84, 3);
  });

  it("boosts a shared prefix but never past 1", () => {
    expect(jaroWinkler("reyes", "reyez")).toBeGreaterThan(jaro("reyes", "reyez"));
    expect(jaroWinkler("okafor", "okafor")).toBe(1);
  });

  it("caps the prefix bonus at four characters", () => {
    // Both pairs share their first four characters; the fifth must not add more.
    const four = jaroWinkler("abcdX", "abcdY");
    const five = jaroWinkler("abcdeX", "abcdeY");
    const fourGap = four - jaro("abcdX", "abcdY");
    const fiveGap = five - jaro("abcdeX", "abcdeY");
    expect(fiveGap).toBeLessThanOrEqual(fourGap + 1e-12);
  });

  it("does not boost strings that are already too different", () => {
    // "ba" vs "bx" shares a prefix but scores below the boost threshold, so the
    // prefix must buy nothing — otherwise a shared first letter starts pulling
    // unrelated surnames toward each other.
    expect(jaroWinkler("ba", "bx")).toBe(jaro("ba", "bx"));
  });

  it("separates the typo pairs this project has to catch from the ones it must not", () => {
    // Real duplicates in the dataset: above the 0.80 name gate.
    expect(jaroWinkler("jonathon", "johnathon")).toBeGreaterThan(0.9);
    expect(jaroWinkler("okafor", "okafo")).toBeGreaterThan(0.9);

    // Different people who happen to share a first letter: comfortably below it.
    expect(jaroWinkler("jane", "john")).toBeLessThan(0.8);
    expect(jaroWinkler("chen", "cheng")).toBeGreaterThan(0.9); // genuinely ambiguous
    expect(jaroWinkler("reyes", "ramirez")).toBeLessThan(0.8);
  });
});
