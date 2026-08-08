import { describe, expect, it } from "vitest";
import { parseCsv, toCsv, toCsvCell } from "./parse.ts";
import { guessMapping, parseLeadFile } from "./mapping.ts";

describe("parseCsv", () => {
  it("reads the shapes real exports contain", () => {
    const text = 'name,email\r\n"Reyes, Bob",bob@acme.example\r\n"He said ""hi""",x@acme.example\r\n';
    expect(parseCsv(text)).toEqual([
      ["name", "email"],
      ["Reyes, Bob", "bob@acme.example"],
      ['He said "hi"', "x@acme.example"],
    ]);
  });

  it("keeps a newline inside a quoted field", () => {
    expect(parseCsv('a,b\n"line one\nline two",x\n')).toEqual([
      ["a", "b"],
      ["line one\nline two", "x"],
    ]);
  });

  it("strips a UTF-8 BOM, which would otherwise corrupt the first header", () => {
    // Excel writes one, and it silently breaks column mapping on `Email`.
    expect(parseCsv("﻿email,phone\nbob@acme.example,555\n")[0]).toEqual(["email", "phone"]);
  });

  it("handles CRLF, LF and a missing trailing newline alike", () => {
    expect(parseCsv("a,b\r\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a,b\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("drops blank lines rather than turning them into rows", () => {
    expect(parseCsv("a,b\n\n1,2\n \n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("tolerates ragged rows", () => {
    expect(parseCsv("a,b,c\n1,2\n")).toEqual([["a", "b", "c"], ["1", "2"]]);
  });

  it("returns nothing for empty input", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n")).toEqual([]);
  });
});

describe("toCsv", () => {
  it("quotes only what needs quoting", () => {
    expect(toCsvCell("plain")).toBe("plain");
    expect(toCsvCell("has,comma")).toBe('"has,comma"');
    expect(toCsvCell('has"quote')).toBe('"has""quote"');
    expect(toCsvCell(undefined)).toBe("");
  });

  it("round-trips through the parser", () => {
    const rows = [
      ["name", "note"],
      ["Reyes, Bob", 'said "hi"'],
      ["Multi\nline", ""],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("guessMapping", () => {
  it("recognises the spellings CRMs actually use", () => {
    const mapping = guessMapping([
      "First Name", "Last Name", "E-mail Address", "Direct Dial",
      "Account Name", "Company Website", "Job Title", "Lead Source", "Last Modified",
    ]);
    expect(mapping).toEqual({
      firstName: 0, lastName: 1, email: 2, phone: 3,
      company: 4, website: 5, title: 6, source: 7, updatedAt: 8,
    });
  });

  it("lets an exact alias beat a fuzzy match, whatever the column order", () => {
    // `Email Opt Out` contains "email" and must not win over `Email`.
    expect(guessMapping(["Email Opt Out", "Email"]).email).toBe(1);
    expect(guessMapping(["Email", "Email Opt Out"]).email).toBe(0);
  });

  it("claims each column and each index at most once", () => {
    const mapping = guessMapping(["email", "work email", "personal email"]);
    const indexes = Object.values(mapping);
    expect(new Set(indexes).size).toBe(indexes.length);
  });

  it("leaves a column unmapped rather than guessing wildly", () => {
    expect(guessMapping(["notes", "score"])).toEqual({});
  });
});

describe("parseLeadFile", () => {
  const file = [
    "Full Name,E-mail Address,Direct Dial,Account Name,Notes",
    "Bob Reyes,b.reyes@acme.example,(555) 019-2837,\"Acme, Inc.\",called twice",
    "Robert Reyes,breyes@acme.example,555.019.2837,Acme Incorporated,",
  ].join("\n");

  it("maps columns and assigns positional ids", () => {
    const parsed = parseLeadFile(file);
    expect(parsed.rows.map((row) => row.id)).toEqual(["r1", "r2"]);
    expect(parsed.rows[0].mapped).toEqual({
      fullName: "Bob Reyes",
      email: "b.reyes@acme.example",
      phone: "(555) 019-2837",
      company: "Acme, Inc.",
    });
  });

  it("keeps every original column, including the ones it did not map", () => {
    // So the export can hand back what it was given.
    const parsed = parseLeadFile(file);
    expect(parsed.rows[0].raw.Notes).toBe("called twice");
    expect(parsed.unmapped).toEqual(["Notes"]);
  });

  it("accepts an override, because a wrong guess changes which rows merge", () => {
    const parsed = parseLeadFile(file, { company: 4 });
    expect(parsed.rows[0].mapped.company).toBe("called twice");
  });

  it("treats a blank cell as absent rather than as an empty value", () => {
    const parsed = parseLeadFile(file);
    expect(parsed.rows[1].mapped.title).toBeUndefined();
    expect("title" in parsed.rows[1].mapped).toBe(false);
  });

  it("survives a file with only a header, or none at all", () => {
    expect(parseLeadFile("email,phone\n").rows).toEqual([]);
    expect(parseLeadFile("").rows).toEqual([]);
  });
});
