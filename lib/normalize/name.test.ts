import { describe, expect, it } from "vitest";
import { normalizeName, titleCase } from "./name.ts";

describe("titleCase", () => {
  it("handles the shapes real surnames take", () => {
    expect(titleCase("robert reyes")).toBe("Robert Reyes");
    expect(titleCase("o'brien")).toBe("O'Brien");
    expect(titleCase("smith-jones")).toBe("Smith-Jones");
    expect(titleCase("mcdonald")).toBe("McDonald");
    expect(titleCase("van der berg")).toBe("Van Der Berg");
  });
});

describe("normalizeName", () => {
  it("splits a full name and lower-cases the match forms", () => {
    const name = normalizeName({ fullName: "Robert Reyes" });
    expect(name.first).toBe("robert");
    expect(name.last).toBe("reyes");
    expect(name.display).toBe("Robert Reyes");
  });

  it("prefers split columns over a full name", () => {
    const name = normalizeName({
      fullName: "nonsense value",
      firstName: "Adaeze",
      lastName: "Okafor",
    });
    expect(name.first).toBe("adaeze");
    expect(name.last).toBe("okafor");
  });

  it("reads the `Last, First` form from the comma", () => {
    const name = normalizeName({ fullName: "Reyes, Robert" });
    expect(name.first).toBe("robert");
    expect(name.last).toBe("reyes");
  });

  it("keeps a generational suffix, because it is what separates two people", () => {
    const junior = normalizeName({ fullName: "Robert Reyes Jr." });
    const senior = normalizeName({ fullName: "Robert Reyes Sr." });

    expect(junior.suffix).toBe("jr");
    expect(senior.suffix).toBe("sr");
    // Same name, same everything else — the suffix is the only field in the row
    // that says these are a father and a son.
    expect(junior.first).toBe(senior.first);
    expect(junior.last).toBe(senior.last);
    expect(junior.suffix).not.toBe(senior.suffix);
    expect(junior.display).toBe("Robert Reyes Jr.");
    expect(normalizeName({ fullName: "Robert Reyes III" }).display).toBe("Robert Reyes III");
  });

  it("separates an honorific instead of leaving it in the name", () => {
    const name = normalizeName({ fullName: "Dr. Wei Chen" });
    expect(name.honorific).toBe("dr");
    expect(name.first).toBe("wei");
    expect(name.last).toBe("chen");
  });

  it("drops post-nominal credentials, which say what someone studied", () => {
    const name = normalizeName({ fullName: "Priya Raman, PhD" });
    expect(name.first).toBe("priya");
    expect(name.last).toBe("raman");
    expect(name.suffix).toBeUndefined();
  });

  it("folds accents so the metrics and the phonetic key see one alphabet", () => {
    const accented = normalizeName({ fullName: "José Múñoz" });
    expect(accented.first).toBe("jose");
    expect(accented.last).toBe("munoz");
    expect(accented.notes.some((note) => note.rule.includes("accents"))).toBe(true);
    expect(accented.lastKey).toBe(normalizeName({ fullName: "Jose Munoz" }).lastKey);
  });

  it("keeps a particle attached to the surname it belongs to", () => {
    const name = normalizeName({ fullName: "Sanne van der Berg" });
    expect(name.first).toBe("sanne");
    expect(name.last).toBe("van der berg");
  });

  it("treats a lone token as a surname", () => {
    // Surnames drive blocking, and a single token in list data is far more often
    // a family name — so this is the guess that loses fewer pairs.
    const name = normalizeName({ fullName: "Okafor" });
    expect(name.last).toBe("okafor");
    expect(name.first).toBeUndefined();
  });

  it("records the formal name behind an unambiguous short form", () => {
    const bob = normalizeName({ fullName: "Bob Reyes" });
    expect(bob.firstCanonical).toBe("robert");
    expect(bob.notes.some((note) => note.rule.includes("short form"))).toBe(true);
  });

  it("leaves an ambiguous short form uncanonicalised", () => {
    // `Sam` could be Samuel, Samantha or Samson. Picking one here would be the
    // single-canonical mistake lib/text/nicknames.ts exists to avoid.
    expect(normalizeName({ fullName: "Sam Reyes" }).firstCanonical).toBeUndefined();
  });

  it("computes a phonetic key on the surname only", () => {
    const name = normalizeName({ fullName: "Robert Reyez" });
    expect(name.lastKey).toBe(normalizeName({ fullName: "Alice Reyes" }).lastKey);
  });

  it("returns nothing but an empty note list for an empty name", () => {
    for (const input of [{}, { fullName: "" }, { fullName: "   " }, { firstName: " " }]) {
      const name = normalizeName(input);
      expect(name.first).toBeUndefined();
      expect(name.last).toBeUndefined();
      expect(name.display).toBeUndefined();
      expect(name.notes).toEqual([]);
    }
  });

  it("handles an honorific sitting in a first-name column", () => {
    const name = normalizeName({ firstName: "Dr. Wei", lastName: "Chen" });
    expect(name.honorific).toBe("dr");
    expect(name.first).toBe("wei");
  });

  it("records a note for every transformation it performs", () => {
    const name = normalizeName({ fullName: "Dr. Bób Reyes Jr., PhD" });
    const rules = name.notes.map((note) => note.rule);
    expect(rules.some((rule) => rule.includes("accents"))).toBe(true);
    expect(rules.some((rule) => rule.includes("honorific"))).toBe(true);
    expect(rules.some((rule) => rule.includes("generational suffix"))).toBe(true);
    expect(rules.some((rule) => rule.includes("short form"))).toBe(true);
  });
});
