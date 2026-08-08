import { describe, expect, it } from "vitest";
import { nameAgreement, scorePair } from "./rules.ts";
import { CONFIG, normalizeOne, recordsById } from "./test-support.ts";

const at = (() => {
  const records = recordsById();
  return (id: string) => records.get(id)!;
})();

const score = (a: string, b: string) => scorePair(at(a), at(b), CONFIG.nameGate);

describe("nameAgreement", () => {
  it("weights the surname above the given name", () => {
    // The surname is the more distinctive half in list data, and the given name is
    // where nicknames and initials put most of the uncertainty.
    const surnameDiffers = nameAgreement(
      normalizeOne("a", { fullName: "Robert Reyes" }),
      normalizeOne("b", { fullName: "Robert Okafor" }),
    );
    const givenDiffers = nameAgreement(
      normalizeOne("a", { fullName: "Robert Reyes" }),
      normalizeOne("b", { fullName: "Adaeze Reyes" }),
    );
    expect(givenDiffers.score).toBeGreaterThan(surnameDiffers.score);
  });

  it("treats a missing surname as neither agreement nor disagreement", () => {
    const agreement = nameAgreement(
      normalizeOne("a", { fullName: "Robert Reyes" }),
      normalizeOne("b", { firstName: "Robert" }),
    );
    expect(agreement.surname).toBe(0.5);
    // Not enough to clear the authoritative floor on its own.
    expect(agreement.surname).toBeLessThan(0.92);
  });

  it("explains both halves, whatever the verdict", () => {
    const agreement = nameAgreement(
      normalizeOne("a", { fullName: "Bob Reyes" }),
      normalizeOne("b", { fullName: "Robert Reyes" }),
    );
    expect(agreement.reasons.map((reason) => reason.rule)).toEqual(["surname", "given name"]);
    expect(agreement.reasons[1].detail).toContain("robert");
  });
});

describe("the authoritative tier", () => {
  it("merges one personal mailbox written two ways", () => {
    const edge = score("r001", "r002");
    expect(edge.kind).toBe("authoritative");
    expect(edge.reasons[0].rule).toBe("identical personal mailbox");
  });

  it("merges through a dot alias and a nickname", () => {
    expect(score("r003", "r004").kind).toBe("authoritative");
  });

  it("merges through a +tag", () => {
    expect(score("r005", "r006").kind).toBe("authoritative");
  });

  it("merges on a shared line plus an agreeing name plus one employer", () => {
    for (const [a, b] of [
      ["r007", "r008"],
      ["r009", "r010"],
      ["r015", "r016"],
      ["r017", "r018"],
      ["r031", "r032"],
      ["r033", "r034"],
    ] as const) {
      expect(score(a, b).kind, `${a}/${b}`).toBe("authoritative");
    }
  });

  it("merges an initials-only row when the line decides which person it is", () => {
    expect(score("r013", "r014").kind).toBe("authoritative");
    // And not to the other Okafor at the same company.
    expect(score("r014", "r055").kind).toBe("probable");
  });

  it("refuses to treat a shared inbox as identity", () => {
    // The marquee false merge. These two addresses are byte-identical after
    // canonicalisation, and the pair must still not be authoritative.
    const ana = at("r049");
    const bruno = at("r050");
    expect(ana.email.canonical).toBe(bruno.email.canonical);
    expect(score("r049", "r050").kind).toBe("probable");
  });

  it("will not merge on a line alone when the names disagree", () => {
    // One switchboard, two people. Identical E.164.
    expect(at("r051").phone.e164).toBe(at("r052").phone.e164);
    expect(score("r051", "r052").kind).toBe("probable");
  });

  it("will not merge on a line when the extensions disagree", () => {
    const left = normalizeOne("a", { fullName: "Femi Adeyemi", phone: "555-019-2837 x204", company: "Acme" });
    const right = normalizeOne("b", { fullName: "Femi Adeyemi", phone: "555-019-2837 x881", company: "Acme" });
    // Same person's name, same line, different desks — positive evidence of two
    // people, so the rule declines rather than merging.
    expect(scorePair(left, right, CONFIG.nameGate).kind).toBe("probable");
  });

  it("will not merge on a line when the employers differ", () => {
    const left = normalizeOne("a", { fullName: "Ada Blake", phone: "555-019-2837", company: "Acme" });
    const right = normalizeOne("b", { fullName: "Ada Blake", phone: "555-019-2837", company: "Kestrel Freight" });
    expect(scorePair(left, right, CONFIG.nameGate).kind).toBe("probable");
  });

  it("merges a personal mailbox across two employers, since it follows its owner", () => {
    expect(score("r023", "r024").kind).toBe("authoritative");
  });
});

describe("the probable tier", () => {
  it("sends a typo pair with no authoritative link to review", () => {
    const edge = score("r011", "r012");
    expect(edge.kind).toBe("probable");
    expect(edge.score).toBeGreaterThanOrEqual(CONFIG.reviewThreshold);
  });

  it("sends a name-company-domain agreement to review", () => {
    const edge = score("r035", "r036");
    expect(edge.kind).toBe("probable");
    expect(edge.score).toBeGreaterThanOrEqual(CONFIG.reviewThreshold);
  });

  it("never promotes a resemblance, however high it scores", () => {
    // There is no threshold at which similarity becomes an automatic merge. The two
    // Wei Chens at Apex score high and stay probable.
    const edge = score("r045", "r046");
    expect(edge.kind).toBe("probable");
    expect(edge.score).toBeGreaterThan(0.7);
  });

  it("gates out a pair that agrees on everything except the name", () => {
    // Alexander and Alexandra Novak: same surname, same employer, same domain.
    const edge = score("r053", "r054");
    expect(edge.score).toBe(0);
    expect(edge.reasons.at(-1)?.rule).toBe("name gate");
  });

  it("lets nothing merge on a shared employer alone", () => {
    const edge = score("r091", "r092");
    expect(edge.score).toBe(0);
  });

  it("counts a differing phone against a pair, but only slightly", () => {
    const shared = normalizeOne("a", { fullName: "Ada Blake", email: "a.blake@acme.example", phone: "555-019-2001" });
    const differs = normalizeOne("b", { fullName: "Ada Blake", email: "ada.blake@acme.example", phone: "555-019-2002" });
    const silent = normalizeOne("c", { fullName: "Ada Blake", email: "ada.blake@acme.example" });

    const withMismatch = scorePair(shared, differs, CONFIG.nameGate);
    const withSilence = scorePair(shared, silent, CONFIG.nameGate);

    expect(withMismatch.score).toBeLessThan(withSilence.score);
    // One person can have a desk line and a mobile, so this must not sink the pair.
    expect(withSilence.score - withMismatch.score).toBeLessThanOrEqual(0.1);
  });

  it("carries a weighted reason for every component it used, and only those", () => {
    // Neither row has a phone, so there is no phone component to report — a
    // missing field contributes nothing rather than contributing zero.
    const noPhone = score("r011", "r012");
    const noPhoneWeighted = noPhone.reasons.filter((reason) => reason.weight !== undefined);
    expect(noPhoneWeighted.map((reason) => reason.rule)).toEqual(["name", "company", "domain"]);

    // Both rows have a phone and they differ, so the penalty shows up as a
    // negative weight rather than as a silent deduction.
    const withPhone = score("r045", "r046");
    const withPhoneWeighted = withPhone.reasons.filter((reason) => reason.weight !== undefined);
    expect(withPhoneWeighted.map((reason) => reason.rule)).toEqual(["name", "company", "domain", "phone"]);
    expect(withPhoneWeighted.at(-1)!.weight).toBeLessThan(0);

    // The reasons are the score, not a commentary on it.
    for (const edge of [noPhone, withPhone]) {
      const total = edge.reasons.reduce((sum, reason) => sum + (reason.weight ?? 0), 0);
      expect(total).toBeCloseTo(edge.score, 6);
    }
  });

  it("is symmetric and canonically oriented", () => {
    const forward = scorePair(at("r011"), at("r012"), CONFIG.nameGate);
    const backward = scorePair(at("r012"), at("r011"), CONFIG.nameGate);
    expect(backward.score).toBeCloseTo(forward.score, 12);
    expect([backward.a, backward.b]).toEqual([forward.a, forward.b]);
  });
});
