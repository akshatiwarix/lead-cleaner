import { describe, expect, it } from "vitest";
import { lastSevenDigits, normalizePhone } from "./phone.ts";

describe("normalizePhone", () => {
  it("reduces every common US spelling to one string", () => {
    // The whole point: phone is an authoritative match signal, so two spellings
    // of one number that fail to compare equal is a missed merge in every row.
    const spellings = [
      "(555) 019-2837",
      "555.019.2837",
      "555 019 2837",
      "5550192837",
      "+1 555 019 2837",
      "+1 (555) 019-2837",
      "15550192837",
      "001 555 019 2837",
    ];
    for (const spelling of spellings) {
      const phone = normalizePhone(spelling, "US");
      expect(phone.e164, spelling).toBe("+15550192837");
      expect(phone.valid, spelling).toBe(true);
    }
  });

  it("separates the extension and keeps it out of the number", () => {
    // `x204` and `x881` are two people at one switchboard. Folding the extension
    // into e164 would make them identical; dropping it would lose the only field
    // that tells them apart.
    const first = normalizePhone("+1 555 019 2837 x204", "US");
    const second = normalizePhone("+1 555 019 2837 ext. 881", "US");

    expect(first.e164).toBe("+15550192837");
    expect(first.extension).toBe("204");
    expect(second.e164).toBe(first.e164);
    expect(second.extension).toBe("881");
    expect(first.extension).not.toBe(second.extension);
  });

  it("reads the extension spellings exports actually contain", () => {
    for (const [input, expected] of [
      ["555-019-2837 ext 12", "12"],
      ["555-019-2837 extension 12", "12"],
      ["555-019-2837 x12", "12"],
      ["555-019-2837 #12", "12"],
      ["555-019-2837 ext. 12", "12"],
    ] as const) {
      expect(normalizePhone(input, "US").extension, input).toBe(expected);
    }
  });

  it("lets an international prefix override the default region", () => {
    const phone = normalizePhone("+91 98200 12345", "US");
    expect(phone.e164).toBe("+919820012345");
    expect(phone.valid).toBe(true);
  });

  it("does not let a short calling code shadow a longer one", () => {
    // `+91...` must not be read as `+9` `1...` or as US `+1`.
    expect(normalizePhone("+919820012345", "US").e164).toBe("+919820012345");
    expect(normalizePhone("+971501234567", "US").e164).toBe("+971501234567");
  });

  it("removes a domestic trunk prefix", () => {
    expect(normalizePhone("020 7946 0958", "GB").e164).toBe("+442079460958");
    expect(normalizePhone("098200 12345", "IN").e164).toBe("+919820012345");
  });

  it("recovers a country code written without a plus", () => {
    expect(normalizePhone("447911123456", "GB").e164).toBe("+447911123456");
  });

  it("refuses a number of the wrong length rather than guessing", () => {
    for (const input of ["555-019", "12345", "555 019 28371234567"]) {
      const phone = normalizePhone(input, "US");
      expect(phone.valid, input).toBe(false);
    }
  });

  it("keeps an international number from a country the table does not list", () => {
    // Refusing a number the user wrote in the correct format would be worse than
    // accepting digits we cannot fully validate.
    const phone = normalizePhone("+358 40 1234567", "US");
    expect(phone.valid).toBe(true);
    expect(phone.e164).toBe("+358401234567");
  });

  it("reports a missing or digitless value as invalid, with a reason", () => {
    expect(normalizePhone(undefined, "US").valid).toBe(false);
    expect(normalizePhone("", "US").valid).toBe(false);
    // A placeholder is caught before the digit scan, and says so — `n/a` is a
    // field someone left blank, not a number that failed to parse.
    const placeholder = normalizePhone("n/a", "US");
    expect(placeholder.valid).toBe(false);
    expect(placeholder.notes[0].rule).toContain("placeholder");

    const junk = normalizePhone("call the switchboard", "US");
    expect(junk.valid).toBe(false);
    expect(junk.notes.some((note) => note.rule.includes("no digits"))).toBe(true);
  });

  it("explains itself for every input it accepts or rejects", () => {
    for (const input of ["(555) 019-2837", "020 7946 0958", "12345"]) {
      expect(normalizePhone(input, "GB").notes.length, input).toBeGreaterThan(0);
    }
  });

  it("refuses a region it has no rules for instead of inventing them", () => {
    const phone = normalizePhone("555 019 2837", "XX");
    expect(phone.valid).toBe(false);
    expect(phone.notes.some((note) => note.rule.includes("no dialling rules"))).toBe(true);
  });
});

describe("lastSevenDigits", () => {
  it("takes the subscriber part, so a missing country code still blocks together", () => {
    expect(lastSevenDigits("+15550192837")).toBe("0192837");
    expect(lastSevenDigits("+445550192837")).toBe("0192837");
  });

  it("returns nothing when there are too few digits to be worth comparing", () => {
    expect(lastSevenDigits("+1555")).toBeUndefined();
    expect(lastSevenDigits(undefined)).toBeUndefined();
  });
});
