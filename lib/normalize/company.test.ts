import { describe, expect, it } from "vitest";
import { normalizeCompany } from "./company.ts";

describe("normalizeCompany", () => {
  it("gives every spelling of one company the same key", () => {
    const keys = [
      "Acme, Inc.",
      "ACME Inc",
      "Acme Incorporated",
      "The Acme Company",
      "acme",
      "  Acme   ",
    ].map((name) => normalizeCompany(name).key);

    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe("acme");
  });

  it("strips legal forms from several jurisdictions", () => {
    for (const [input, expected] of [
      ["Nordwind GmbH", "nordwind"],
      ["Solaris S.A.", "solaris"],
      ["Kestrel Pty Ltd", "kestrel"],
      ["Raman Private Limited", "raman"],
      ["Meridian LLP", "meridian"],
      ["Hokusai Kabushiki Kaisha", "hokusai"],
      ["Vega B.V.", "vega"],
    ] as const) {
      expect(normalizeCompany(input).key, input).toBe(expected);
    }
  });

  it("strips stacked legal forms", () => {
    expect(normalizeCompany("North Star Data Ltd Inc").key).toBe("north star data");
  });

  it("keeps words that look like legal forms but change the entity", () => {
    // The guard this module exists for. `Acme` and `Acme Holdings` are routinely
    // two entities; stripping the distinction would collapse a parent into its
    // subsidiary and put their employees in one bucket.
    for (const suffix of ["Holdings", "Group", "Labs", "Partners", "Ventures", "Systems"]) {
      expect(normalizeCompany(`Acme ${suffix}`).key, suffix).toBe(`acme ${suffix.toLowerCase()}`);
      expect(normalizeCompany(`Acme ${suffix}`).key).not.toBe("acme");
    }
  });

  it("expands `&`, which the same company spells both ways", () => {
    expect(normalizeCompany("Reyes & Okafor").key).toBe(normalizeCompany("Reyes and Okafor").key);
  });

  it("folds accents so one company does not become two", () => {
    expect(normalizeCompany("Múñoz Solar").key).toBe(normalizeCompany("Munoz Solar").key);
  });

  it("refuses to strip a name down to nothing", () => {
    // A company genuinely called `Co` keeps its only token, rather than
    // normalising to the empty string and matching every other empty one.
    expect(normalizeCompany("Co").key).toBe("co");
    expect(normalizeCompany("Ltd").key).toBe("ltd");
  });

  it("produces a display form alongside the key", () => {
    const company = normalizeCompany("north star data works, inc.");
    expect(company.key).toBe("north star data works");
    expect(company.normalized).toBe("North Star Data Works");
  });

  it("returns nothing for input with no letters or digits", () => {
    for (const input of [undefined, "", "   ", "---", "n/a  ".replace("n/a", "!!!")]) {
      const company = normalizeCompany(input);
      expect(company.key, String(input)).toBeUndefined();
    }
  });

  it("records a note for every change it makes", () => {
    const company = normalizeCompany("The Múñoz Sólar Company Ltd");
    const rules = company.notes.map((note) => note.rule);
    expect(rules.some((rule) => rule.includes("accents"))).toBe(true);
    expect(rules.some((rule) => rule.includes("leading `the`"))).toBe(true);
    expect(rules.filter((rule) => rule.includes("legal form"))).toHaveLength(2);
    expect(company.key).toBe("munoz solar");
  });
});
