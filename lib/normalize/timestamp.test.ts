import { describe, expect, it } from "vitest";
import { normalizeTimestamp } from "./timestamp.ts";

describe("normalizeTimestamp", () => {
  it("reads ISO dates, with or without a time part", () => {
    expect(normalizeTimestamp("2026-02-04")).toBe("2026-02-04");
    expect(normalizeTimestamp("2026-02-04T11:32:00Z")).toBe("2026-02-04");
    expect(normalizeTimestamp("2026/2/4")).toBe("2026-02-04");
  });

  it("reads named months in either order", () => {
    expect(normalizeTimestamp("4 Feb 2026")).toBe("2026-02-04");
    expect(normalizeTimestamp("Feb 4, 2026")).toBe("2026-02-04");
    expect(normalizeTimestamp("February 4 2026")).toBe("2026-02-04");
    expect(normalizeTimestamp("4-February-2026")).toBe("2026-02-04");
    expect(normalizeTimestamp("Feb 4th, 2026")).toBe("2026-02-04");
  });

  it("reads a slashed date when only one ordering is possible", () => {
    expect(normalizeTimestamp("31/01/2026")).toBe("2026-01-31");
    expect(normalizeTimestamp("01/31/2026")).toBe("2026-01-31");
  });

  it("refuses a slashed date that two locales would read differently", () => {
    // The case this module exists for. `03/04/2026` is April 3rd or March 4th
    // depending on who wrote the file, and a misread date does not throw — it
    // quietly hands a field to the wrong record. Refusing lets the survivorship
    // chain fall through to its deterministic tiebreak instead.
    expect(normalizeTimestamp("03/04/2026")).toBeUndefined();
    expect(normalizeTimestamp("12/11/2026")).toBeUndefined();
  });

  it("refuses anything it cannot read", () => {
    for (const input of [undefined, "", "  ", "last tuesday", "2026", "Q1 2026", "02-04-26"]) {
      expect(normalizeTimestamp(input), String(input)).toBeUndefined();
    }
  });

  it("refuses an out-of-range month or day", () => {
    expect(normalizeTimestamp("2026-13-01")).toBeUndefined();
    expect(normalizeTimestamp("2026-01-32")).toBeUndefined();
  });

  it("emits strings that sort chronologically", () => {
    // Why the output is a string and not a Date: ISO dates compare correctly with
    // `<`, so nothing downstream needs a timezone.
    const dates = ["4 Feb 2026", "2025-12-31", "01/15/2026"].map((input) => normalizeTimestamp(input)!);
    expect([...dates].sort()).toEqual(["2025-12-31", "2026-01-15", "2026-02-04"]);
  });
});
