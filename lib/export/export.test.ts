import { describe, expect, it } from "vitest";
import { auditJson, cleanedCsv, reviewCsv } from "./index.ts";
import { clean } from "../clean/run.ts";
import { DEFAULT_CONFIG } from "../clean/config.ts";
import { demoRows } from "../../data/leads.ts";
import { parseCsv } from "../csv/parse.ts";
import type { Constraint } from "../clean/types.ts";

const rows = demoRows();
const result = clean(rows, DEFAULT_CONFIG);

describe("cleaned.csv", () => {
  const table = parseCsv(cleanedCsv(result, rows));
  const header = table[0];
  const body = table.slice(1);
  const column = (row: string[], name: string) => row[header.indexOf(name)];

  it("has one line per person plus one per quarantined row", () => {
    expect(body).toHaveLength(result.clusters.length + result.quarantined.length);
  });

  it("accounts for every input row, so nothing is lost between the app and the file", () => {
    const accounted = body.flatMap((row) => column(row, "merged_from").split(" ").filter(Boolean));
    expect(accounted.sort()).toEqual(rows.map((row) => row.id).sort());
  });

  it("marks a quarantined row as such and says why", () => {
    const held = body.find((row) => column(row, "person_id") === "r061")!;
    expect(column(held, "status")).toBe("quarantined");
    expect(column(held, "quarantine_reason")).toContain("no way to identify a person");
  });

  it("leaves a quarantined row's values as they arrived", () => {
    // The point is that a human can see what was held back, not that it was cleaned.
    const held = body.find((row) => column(row, "person_id") === "r066")!;
    expect(column(held, "full_name")).toBe("n/a");
  });

  it("carries the losing values of every conflict inline", () => {
    const merged = body.find((row) => column(row, "merged_from").includes("r041"))!;
    expect(column(merged, "conflicts")).toContain("Vega Logistica");
    expect(column(merged, "conflicts")).toContain("kept");
  });

  it("says how each merge was reached", () => {
    const strengths = new Set(body.map((row) => column(row, "match_strength")));
    expect(strengths).toContain("authoritative");
    expect(strengths).toContain("singleton");
  });

  it("survives a round trip through the parser", () => {
    // Company names contain commas; nothing may shift a column.
    const reparsed = parseCsv(cleanedCsv(result, rows));
    expect(reparsed.every((row) => row.length === header.length)).toBe(true);
  });
});

describe("review.csv", () => {
  const table = parseCsv(reviewCsv(result, rows));

  it("has one line per pending pair, most likely first", () => {
    expect(table).toHaveLength(result.review.length + 1);
    const scores = table.slice(1).map((row) => Number(row[0]));
    expect(scores).toEqual([...scores].sort((left, right) => right - left));
  });

  it("shows both rows side by side, so a decision can be made from the file alone", () => {
    const first = table[1];
    expect(first[2]).toMatch(/^r\d+$/);
    expect(first[7]).toMatch(/^r\d+$/);
    expect(first.at(-1)).toContain("surname");
  });

  it("leaves the decision column blank for the reviewer to fill in", () => {
    // The file comes back as a constraint set: `link` or `must-not-link` per row.
    for (const row of table.slice(1)) expect(row[1]).toBe("");
  });
});

describe("audit.json", () => {
  const constraints: Constraint[] = [{ kind: "link", a: "r011", b: "r012", by: "human", note: "same person" }];
  const withConstraints = clean(rows, DEFAULT_CONFIG, constraints);
  const audit = JSON.parse(auditJson(withConstraints, constraints));

  it("carries everything needed to reproduce the run", () => {
    expect(audit.runHash).toBe(withConstraints.runHash);
    expect(audit.config).toEqual(DEFAULT_CONFIG);
    expect(audit.constraints).toEqual(constraints);
  });

  it("lets someone who was not there re-run it and get the same answer", () => {
    // The reproducibility claim, exercised: config and constraints out of the file,
    // rows from the same source, and the hash has to match.
    const replayed = clean(rows, audit.config, audit.constraints);
    expect(replayed.runHash).toBe(audit.runHash);
    expect(JSON.stringify(replayed.clusters)).toBe(JSON.stringify(withConstraints.clusters));
  });

  it("includes the refusals, not only the merges", () => {
    expect(audit.refused.length).toBeGreaterThan(0);
    expect(audit.refused[0].reasons.some((reason: { verdict: string }) => reason.verdict === "refuse")).toBe(true);
  });

  it("includes field-level provenance for every merged cluster", () => {
    const merged = audit.clusters.find((cluster: { memberIds: string[] }) => cluster.memberIds.length > 1);
    expect(Object.keys(merged.provenance).length).toBeGreaterThan(0);
    for (const provenance of Object.values(merged.provenance) as { winnerId: string; rule: string }[]) {
      expect(provenance.winnerId).toMatch(/^r\d+$/);
      expect(provenance.rule.length).toBeGreaterThan(0);
    }
  });

  it("contains no timestamp, so two identical runs produce identical files", () => {
    expect(auditJson(withConstraints, constraints)).toBe(auditJson(clean(rows, DEFAULT_CONFIG, constraints), constraints));
  });
});
