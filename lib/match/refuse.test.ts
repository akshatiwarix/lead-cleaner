import { describe, expect, it } from "vitest";
import { mustNotLinkSet, refusalFor } from "./refuse.ts";
import { CONFIG, normalizeOne, recordsById } from "./test-support.ts";
import { scorePair } from "./rules.ts";

const at = (() => {
  const records = recordsById();
  return (id: string) => records.get(id)!;
})();

const none = mustNotLinkSet([]);
const refusal = (a: string, b: string, mustNotLink = none) => refusalFor(at(a), at(b), mustNotLink);

describe("refusals", () => {
  it("refuses two corporate mailboxes at two employers", () => {
    const reason = refusal("r047", "r048");
    expect(reason?.rule).toBe("different corporate mailboxes at different employers");
    expect(reason?.detail).toContain("unrecoverable");
  });

  it("refuses one local part at two corporate domains", () => {
    expect(refusal("r057", "r058")?.verdict).toBe("refuse");
  });

  it("refuses a father and son, on the suffix alone", () => {
    // Every other signal in these two rows says one person: same name, same
    // employer, same domain. The suffix is the only field that disagrees.
    const senior = at("r043");
    const junior = at("r044");
    expect(senior.name.first).toBe(junior.name.first);
    expect(senior.company.key).toBe(junior.company.key);

    const reason = refusal("r043", "r044");
    expect(reason?.rule).toBe("generational suffixes disagree");
    expect(reason?.detail).toContain("SR");
  });

  it("beats the authoritative phone rule", () => {
    // The father and son share the office line, so name, employer, domain and
    // phone all agree and the pair scores as *authoritative* on its own. The
    // refusal has to win, or a shared landline at a family firm would be enough to
    // merge two people. This is what "refusals are evaluated first" means.
    expect(scorePair(at("r043"), at("r044"), CONFIG.nameGate).kind).toBe("authoritative");
    expect(refusal("r043", "r044")?.verdict).toBe("refuse");
  });

  it("refuses two employers even where the authoritative rule would decline anyway", () => {
    // Ryan Doyle at Blue Harbor and at Hokusai, sharing a line. The phone rule
    // already declines on the employer mismatch, so the refusal is what puts the
    // reason in the audit trail rather than leaving the pair merely unmatched.
    expect(refusal("r059", "r060")?.verdict).toBe("refuse");
  });

  it("lets a reviewer's rejection override everything", () => {
    const mustNotLink = mustNotLinkSet([
      { kind: "must-not-link", a: "r001", b: "r002", by: "human", note: "checked with the rep" },
    ]);
    // These two rows share one mailbox and would otherwise merge automatically.
    expect(scorePair(at("r001"), at("r002"), CONFIG.nameGate).kind).toBe("authoritative");
    expect(refusal("r001", "r002", mustNotLink)?.rule).toBe("reviewer marked these as different people");
  });

  it("does not refuse a personal mailbox that followed its owner to a new job", () => {
    // A consumer mailbox is not employer evidence, so the same-name-two-employers
    // rule must not fire on it — this pair is one human who changed jobs.
    expect(refusal("r023", "r024")).toBeUndefined();
  });

  it("does not refuse two mailboxes at the same employer", () => {
    // `bill.trent@` and `w.trent@kestrel.example` are one person with two
    // addresses. Refusing on two mailboxes alone would destroy recall.
    expect(refusal("r007", "r008")).toBeUndefined();
  });

  it("does not refuse when only one row carries a suffix", () => {
    // `Robert Reyes` and `Robert Reyes Jr.` might be the same person written
    // carelessly. Weaker evidence than a disagreement, so it goes to scoring.
    const plain = normalizeOne("a", { fullName: "Robert Reyes", email: "r.reyes@acme.example" });
    const junior = normalizeOne("b", { fullName: "Robert Reyes Jr.", email: "rob.reyes@acme.example" });
    expect(refusalFor(plain, junior, none)).toBeUndefined();
  });

  it("does not refuse an unrelated pair for having no evidence", () => {
    // Absence is not refutation: two rows with nothing in common are simply not a
    // match, and manufacturing a refusal would pollute the audit trail.
    expect(refusal("r067", "r085")).toBeDefined(); // different corporate employers
    expect(refusal("r061", "r062")).toBeUndefined(); // two rows with almost nothing
  });
});
