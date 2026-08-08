import { describe, expect, it } from "vitest";
import type { CleanConfig, InputRow } from "../clean/types.ts";
import { normalizeRow, normalizeRows, notesFor } from "./index.ts";

const CONFIG: CleanConfig = {
  reviewThreshold: 0.82,
  nameGate: 0.8,
  sourceTrust: ["crm-export", "form-fill", "purchased-list"],
  blocking: true,
  maxBlockSize: 200,
  defaultPhoneRegion: "US",
};

function row(id: string, mapped: InputRow["mapped"]): InputRow {
  return { id, mapped, raw: {} };
}

describe("normalizeRow", () => {
  it("assembles every field of a messy row", () => {
    const record = normalizeRow(
      row("r001", {
        fullName: "Dr. Bob Reyes Jr.",
        email: "  B.Reyes+webinar@Acme.Example ",
        phone: "(555) 019-2837 x204",
        company: "The Acme Company, Inc.",
        website: "https://www.acme.example/about",
        title: "VP OF REVENUE OPERATIONS",
        source: "CRM Export",
        updatedAt: "4 Feb 2026",
      }),
      CONFIG,
    );

    expect(record.id).toBe("r001");
    expect(record.name.first).toBe("bob");
    expect(record.name.suffix).toBe("jr");
    expect(record.name.firstCanonical).toBe("robert");
    expect(record.email.canonical).toBe("b.reyes@acme.example");
    expect(record.email.kind).toBe("personal");
    expect(record.phone.e164).toBe("+15550192837");
    expect(record.phone.extension).toBe("204");
    expect(record.company.key).toBe("acme");
    expect(record.domain).toEqual({ value: "acme.example", source: "website" });
    expect(record.title.tidied).toBe("VP of Revenue Operations");
    expect(record.source).toBe("crm-export");
    expect(record.updatedAt).toBe("2026-02-04");
  });

  it("takes the domain from a corporate email when no website column exists", () => {
    // Why email is normalized before domain: the address is where the domain
    // comes from, and its *kind* is what decides whether that is allowed.
    const corporate = normalizeRow(row("r1", { email: "bob@acme.example" }), CONFIG);
    expect(corporate.domain).toEqual({ value: "acme.example", source: "email" });

    const consumer = normalizeRow(row("r2", { email: "bob@gmail.com" }), CONFIG);
    expect(consumer.domain).toEqual({ source: "none" });
  });

  it("survives a row that is almost entirely empty", () => {
    const record = normalizeRow(row("r001", {}), CONFIG);
    expect(record.email.kind).toBe("missing");
    expect(record.phone.valid).toBe(false);
    expect(record.name.first).toBeUndefined();
    expect(record.company.key).toBeUndefined();
    expect(record.domain.source).toBe("none");
    expect(record.updatedAt).toBeUndefined();
  });

  it("leaves title seniority alone, because Day 011 owns it", () => {
    const record = normalizeRow(row("r1", { title: "  Senior   Director,  RevOps " }), CONFIG);
    expect(record.title.tidied).toBe("Senior Director, RevOps");
  });

  it("un-shouts a title without mangling its acronyms", () => {
    expect(normalizeRow(row("r1", { title: "HEAD OF GTM ENGINEERING" }), CONFIG).title.tidied).toBe(
      "Head of GTM Engineering",
    );
    expect(normalizeRow(row("r1", { title: "SVP, SALES" }), CONFIG).title.tidied).toBe("SVP, Sales");
  });

  it("uses the configured phone region", () => {
    const gb = normalizeRow(row("r1", { phone: "020 7946 0958" }), CONFIG);
    expect(gb.phone.valid).toBe(false);

    const record = normalizeRow(row("r1", { phone: "020 7946 0958" }), {
      ...CONFIG,
      defaultPhoneRegion: "GB",
    });
    expect(record.phone.e164).toBe("+442079460958");
  });

  it("gives source labels one spelling so trust ranking can match them", () => {
    for (const input of ["CRM Export", "crm export", "crm_export", " CRM-EXPORT "]) {
      expect(normalizeRow(row("r1", { source: input }), CONFIG).source, input).toBe("crm-export");
    }
  });

  it("preserves row ids exactly", () => {
    // Ids are the survivorship tiebreak of last resort; rewriting one here would
    // put input order into the output.
    const records = normalizeRows([row("r009", {}), row("r002", {})], CONFIG);
    expect(records.map((record) => record.id)).toEqual(["r009", "r002"]);
  });

  it("is a pure function of its input", () => {
    const input = row("r001", { fullName: "Bob Reyes", email: "bob@acme.example" });
    expect(normalizeRow(input, CONFIG)).toEqual(normalizeRow(input, CONFIG));
  });
});

describe("notesFor", () => {
  it("flattens every recorded transformation, tagged by field", () => {
    const record = normalizeRow(
      row("r001", {
        fullName: "Dr. Bób Reyes Jr.",
        email: "B.Reyes+list@gmail.com",
        phone: "555-019-2837 x204",
        company: "The Acme Company Ltd",
      }),
      CONFIG,
    );

    const notes = notesFor(record);
    const fields = new Set(notes.map((note) => note.field));
    expect(fields).toEqual(new Set(["name", "email", "phone", "company"]));
    // Each note names a rule, and where the value came from and went to, so a
    // merge can always answer "what did you do to this row first?".
    for (const note of notes) {
      expect(note.rule.length).toBeGreaterThan(0);
      expect(typeof note.from).toBe("string");
      expect(typeof note.to).toBe("string");
    }
  });

  it("is empty for a row that needed no cleaning", () => {
    const record = normalizeRow(row("r001", { fullName: "Bob Reyes" }), CONFIG);
    expect(notesFor(record).map((note) => note.field)).toEqual(["name"]);
  });
});
