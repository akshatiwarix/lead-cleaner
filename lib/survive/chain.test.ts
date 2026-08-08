import { describe, expect, it } from "vitest";
import { pickWinner, type Candidate } from "./chain.ts";

const TRUST = ["crm-export", "enrichment", "form-fill", "event-list", "purchased-list"];
const pick = (candidates: Candidate[]) => pickWinner(candidates, TRUST);

describe("the survivorship chain", () => {
  it("returns nothing when no row has a value", () => {
    expect(pick([{ id: "r1" }, { id: "r2", value: "" }])).toBeUndefined();
  });

  it("rung 1: a non-empty value beats an empty one, whatever else says", () => {
    // The rung that matters most in practice. A newer, more trusted row that simply
    // dropped a column must not erase the column.
    const winner = pick([
      { id: "r1", value: "+15550192837", source: "purchased-list", updatedAt: "2020-01-01" },
      { id: "r2", value: undefined, source: "crm-export", updatedAt: "2026-07-01" },
    ]);
    expect(winner?.winnerId).toBe("r1");
    expect(winner?.rule).toBe("only row with a value for this field");
  });

  it("rung 2: a usable value beats an unusable one", () => {
    const winner = pick([
      { id: "r1", value: "info@acme.example", valid: false, source: "crm-export" },
      { id: "r2", value: "bob@acme.example", valid: true, source: "purchased-list" },
    ]);
    expect(winner?.winnerId).toBe("r2");
    expect(winner?.rule).toContain("did not parse");
  });

  it("rung 3: source trust beats recency", () => {
    // "Newest wins" is the common default and it is wrong for lead data: the newest
    // touch is often a form fill or a bought list overwriting the CRM record.
    const winner = pick([
      { id: "r1", value: "Vega Logistics", source: "crm-export", updatedAt: "2026-02-01" },
      { id: "r2", value: "Vega Logistica", source: "purchased-list", updatedAt: "2026-07-01" },
    ]);
    expect(winner?.value).toBe("Vega Logistics");
    expect(winner?.rule).toContain("most trusted source");
  });

  it("rung 4: recency decides between equally trusted rows", () => {
    const winner = pick([
      { id: "r1", value: "Head of Ops", source: "crm-export", updatedAt: "2026-01-05" },
      { id: "r2", value: "Director of Operations", source: "crm-export", updatedAt: "2026-06-11" },
    ]);
    expect(winner?.value).toBe("Director of Operations");
    expect(winner?.rule).toContain("most recent");
  });

  it("rung 5: the lowest id breaks a total tie, so there is always an answer", () => {
    const winner = pick([
      { id: "r9", value: "B", source: "crm-export", updatedAt: "2026-01-01" },
      { id: "r2", value: "A", source: "crm-export", updatedAt: "2026-01-01" },
    ]);
    expect(winner?.winnerId).toBe("r2");
    expect(winner?.rule).toContain("lowest row id");
  });

  it("keeps every disagreeing value rather than resolving it away", () => {
    // Resolving a conflict silently is the same as deleting the loser.
    const winner = pick([
      { id: "r1", value: "Director of RevOps", source: "crm-export", updatedAt: "2026-04-01" },
      { id: "r2", value: "VP Revenue Operations", source: "event-list", updatedAt: "2026-05-20" },
    ]);
    expect(winner?.value).toBe("Director of RevOps");
    expect(winner?.conflicts).toEqual([{ id: "r2", value: "VP Revenue Operations" }]);
  });

  it("counts rows that agree as agreement, not as conflict", () => {
    const winner = pick([
      { id: "r1", value: "Acme", source: "crm-export" },
      { id: "r2", value: "Acme", source: "form-fill" },
      { id: "r3", value: "Acme", source: "event-list" },
    ]);
    expect(winner?.conflicts).toEqual([]);
  });

  it("reports one conflict per distinct value, not per row", () => {
    const winner = pick([
      { id: "r1", value: "Acme", source: "crm-export" },
      { id: "r2", value: "Apex", source: "form-fill" },
      { id: "r3", value: "Apex", source: "event-list" },
    ]);
    expect(winner?.conflicts).toEqual([{ id: "r2", value: "Apex" }]);
  });

  it("ranks an unlabelled source after every configured one", () => {
    const winner = pick([
      { id: "r1", value: "A", source: undefined },
      { id: "r2", value: "B", source: "purchased-list" },
    ]);
    expect(winner?.value).toBe("B");
  });

  it("does not depend on the order the candidates arrive in", () => {
    const candidates: Candidate[] = [
      { id: "r3", value: "C", source: "event-list", updatedAt: "2026-03-01" },
      { id: "r1", value: "A", source: "crm-export", updatedAt: "2026-01-01" },
      { id: "r2", value: "B", source: "crm-export", updatedAt: "2026-02-01" },
    ];
    const forward = pick(candidates);
    const backward = pick([...candidates].reverse());
    expect(backward).toEqual(forward);
  });

  it("treats a field with no validity notion as usable", () => {
    // `valid` is optional; absent must not lose to an explicit true.
    const winner = pick([
      { id: "r1", value: "acme.example", source: "crm-export" },
      { id: "r2", value: "apex.example", valid: true, source: "purchased-list" },
    ]);
    expect(winner?.winnerId).toBe("r1");
  });
});
