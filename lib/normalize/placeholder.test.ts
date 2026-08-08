import { describe, expect, it } from "vitest";
import { isPlaceholder, orAbsent } from "./placeholder.ts";
import { normalizeCompany } from "./company.ts";
import { normalizeEmail } from "./email.ts";
import { normalizeName } from "./name.ts";
import { normalizePhone } from "./phone.ts";

describe("isPlaceholder", () => {
  it("recognises the values people type instead of leaving a field empty", () => {
    for (const value of [
      "n/a", "N/A", " n / a ", "na", "NULL", "none", "unknown", "TBD", "-", "--",
      "?", "0", "test", "not available", "no email",
    ]) {
      expect(isPlaceholder(value), value).toBe(true);
    }
  });

  it("treats blank as a placeholder too", () => {
    expect(isPlaceholder("")).toBe(true);
    expect(isPlaceholder("   ")).toBe(true);
  });

  it("only matches a whole field, never a word inside a real value", () => {
    // `Unknown Logistics` is a company, and a firm called `None Partners` keeps
    // its name. Matching substrings here would delete real data.
    for (const value of [
      "Unknown Logistics", "None Partners", "Nathan", "Nadia", "Tobias",
      "n/a systems", "Test Valley Group", "Naomi",
    ]) {
      expect(isPlaceholder(value), value).toBe(false);
    }
  });
});

describe("orAbsent", () => {
  it("passes real values through and drops placeholders", () => {
    expect(orAbsent("Head of Sales")).toBe("Head of Sales");
    expect(orAbsent("n/a")).toBeUndefined();
    expect(orAbsent(undefined)).toBeUndefined();
  });
});

describe("the field modules refuse placeholders", () => {
  it("keeps `n/a` out of a surname, where every other n/a row would match it", () => {
    const name = normalizeName({ fullName: "n/a" });
    expect(name.last).toBeUndefined();
    expect(name.notes[0].rule).toContain("placeholder");
  });

  it("keeps a placeholder out of the company key", () => {
    expect(normalizeCompany("N/A").key).toBeUndefined();
    expect(normalizeCompany("unknown").key).toBeUndefined();
  });

  it("reports a placeholder address as missing rather than invalid", () => {
    // Different failure, different meaning: `invalid` reads as a data-quality
    // problem someone should fix, where this row simply has no address.
    expect(normalizeEmail("unknown").kind).toBe("missing");
    expect(normalizeEmail("n/a").kind).toBe("missing");
    expect(normalizeEmail("not-an-email").kind).toBe("invalid");
  });

  it("keeps a placeholder out of the phone field", () => {
    const phone = normalizePhone("-", "US");
    expect(phone.valid).toBe(false);
    expect(phone.notes[0].rule).toContain("placeholder");
  });
});
