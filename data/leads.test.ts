import { describe, expect, it } from "vitest";
import { LEADS, demoRows } from "./leads.ts";
import { normalizeRows } from "../lib/normalize/index.ts";
import { hostFrom } from "../lib/normalize/domain.ts";
import type { CleanConfig } from "../lib/clean/types.ts";

const CONFIG: CleanConfig = {
  reviewThreshold: 0.82,
  nameGate: 0.8,
  sourceTrust: ["crm-export", "enrichment", "form-fill", "event-list", "purchased-list"],
  blocking: true,
  maxBlockSize: 200,
  defaultPhoneRegion: "US",
};

describe("the dataset's shape", () => {
  it("is 150 rows with unique ids in order", () => {
    expect(LEADS).toHaveLength(150);
    const ids = LEADS.map((lead) => lead.id);
    expect(new Set(ids).size).toBe(150);
    expect(ids).toEqual([...ids].sort());
  });

  it("annotates every row with what it proves", () => {
    for (const lead of LEADS) {
      expect(lead.scenario.length, lead.id).toBeGreaterThan(0);
      expect(lead.truePersonId, lead.id).toMatch(/^p\d{3}$/);
    }
  });

  it("collapses to a population the dedup rate can be quoted against", () => {
    const people = new Set(LEADS.map((lead) => lead.truePersonId));
    // 150 rows, 104 people: a 30% dedup rate, in the range real CRM exports
    // land in. If either number moves, the README tables move with it.
    expect(people.size).toBe(104);
  });

  it("has enough duplicate rows to be worth deduplicating", () => {
    const counts = new Map<string, number>();
    for (const lead of LEADS) {
      counts.set(lead.truePersonId, (counts.get(lead.truePersonId) ?? 0) + 1);
    }
    const duplicated = [...counts.values()].filter((count) => count > 1);
    expect(duplicated.length).toBeGreaterThanOrEqual(40);
    // Two people appear three times, so transitive clustering is exercised.
    expect([...counts.values()].filter((count) => count === 3)).toHaveLength(2);
  });
});

describe("the dataset cannot point at anything real", () => {
  it("uses only reserved .example domains", () => {
    // The absolute rule. `.example` is reserved by RFC 2606 and unregistrable, so
    // no row can name a real company or reach a real mailbox — including the
    // free-mail rows, which use reserved stand-in providers for that reason.
    for (const lead of LEADS) {
      if (lead.email !== undefined && lead.email.includes("@")) {
        const domain = lead.email.trim().toLowerCase().split("@").pop()!;
        expect(domain.endsWith(".example"), `${lead.id}: ${lead.email}`).toBe(true);
      }
      if (lead.website !== undefined) {
        const host = hostFrom(lead.website);
        expect(host === undefined || host.endsWith(".example"), `${lead.id}: ${lead.website}`).toBe(true);
      }
    }
  });

  it("uses only the 555-01xx range reserved for fiction", () => {
    for (const lead of LEADS) {
      if (lead.phone === undefined) continue;
      const digits = lead.phone.replace(/\D/g, "");
      if (digits.length < 10) continue;
      expect(digits.slice(0, 6), `${lead.id}: ${lead.phone}`).toBe("555019");
    }
  });
});

describe("the scenarios the dataset claims to cover", () => {
  const scenarios = new Set(LEADS.map((lead) => lead.scenario));

  it("covers every kind of duplicate the engine has to find", () => {
    for (const scenario of [
      "exact-duplicate",
      "alias-dots",
      "alias-plus-tag",
      "nickname-plus-phone",
      "typo-with-phone",
      "typo-review-only",
      "initials-disambiguated-by-phone",
      "formatting-only",
      "accent-folding",
      "honorific-and-credentials",
      "surname-change-same-mailbox",
      "job-change-shared-personal-mailbox",
      "transitive-three-row-cluster",
      "transitive-mixed-evidence",
      "company-spelling-plus-phone",
      "same-extension-same-person",
      "domain-only-review",
    ]) {
      expect(scenarios, scenario).toContain(scenario);
    }
  });

  it("covers every hard negative, which is where a deduplicator actually fails", () => {
    for (const scenario of [
      "hard-negative-father-and-son",
      "hard-negative-namesakes-one-company",
      "hard-negative-same-name-two-employers",
      "hard-negative-shared-role-inbox",
      "hard-negative-one-switchboard",
      "hard-negative-gendered-pair",
      "hard-negative-initials-ambiguity",
      "hard-negative-shared-surname",
      "hard-negative-same-local-part",
      "hard-negative-refusal-beats-phone-rule",
    ]) {
      expect(scenarios, scenario).toContain(scenario);
    }
  });

  it("covers the survivorship rungs and the conflict path", () => {
    for (const scenario of [
      "conflicting-title",
      "survivorship-completeness-beats-recency",
      "survivorship-trust-beats-recency",
    ]) {
      expect(scenarios, scenario).toContain(scenario);
    }
  });

  it("covers every quarantine reason", () => {
    for (const scenario of [
      "quarantine-company-only",
      "quarantine-title-only",
      "quarantine-invalid-email-only",
      "quarantine-name-without-context",
      "quarantine-blank-row",
      "quarantine-placeholder-junk",
    ]) {
      expect(scenarios, scenario).toContain(scenario);
    }
  });
});

describe("the hard negatives are actually hard", () => {
  const records = new Map(normalizeRows(demoRows(), CONFIG).map((record) => [record.id, record]));
  const at = (id: string) => records.get(id)!;

  it("gives the father and son identical names and one company", () => {
    // If normalization pulled these apart, the pair would prove nothing.
    const senior = at("r043");
    const junior = at("r044");
    expect(junior.name.first).toBe(senior.name.first);
    expect(junior.name.last).toBe(senior.name.last);
    expect(junior.company.key).toBe(senior.company.key);
    expect(junior.domain.value).toBe(senior.domain.value);
    expect([senior.name.suffix, junior.name.suffix]).toEqual(["sr", "jr"]);
  });

  it("gives the two namesakes one company and nothing to tell them apart", () => {
    const first = at("r045");
    const second = at("r046");
    expect(first.name.last).toBe(second.name.last);
    expect(first.company.key).toBe(second.company.key);
    expect(first.phone.e164).not.toBe(second.phone.e164);
  });

  it("gives the two people behind the shared inbox one identical address", () => {
    // The marquee false merge: the email is byte-identical after canonicalisation
    // and must still not join them, because it is a role address.
    const ana = at("r049");
    const bruno = at("r050");
    expect(ana.email.canonical).toBe(bruno.email.canonical);
    expect(ana.email.kind).toBe("role");
    expect(bruno.email.kind).toBe("role");
    expect(ana.name.first).not.toBe(bruno.name.first);
  });

  it("gives the two people on one switchboard one identical E.164", () => {
    const partner = at("r051");
    const associate = at("r052");
    expect(partner.phone.e164).toBe(associate.phone.e164);
    expect(partner.phone.extension).not.toBe(associate.phone.extension);
  });

  it("keeps the gendered pair as similar as the metric can make them", () => {
    const alexander = at("r053");
    const alexandra = at("r054");
    expect(alexander.name.last).toBe(alexandra.name.last);
    expect(alexander.company.key).toBe(alexandra.company.key);
    expect(alexander.name.first).not.toBe(alexandra.name.first);
  });

  it("puts a second Okafor in the company the initials-only row belongs to", () => {
    const jane = at("r013");
    const initials = at("r014");
    const john = at("r055");
    expect(john.name.last).toBe(jane.name.last);
    expect(john.company.key).toBe(jane.company.key);
    // The phone is the only thing that says which of the two `J. Okafor` is.
    expect(initials.phone.e164).toBe(jane.phone.e164);
    expect(initials.phone.e164).not.toBe(john.phone.e164);
  });

  it("refuses to give a free-mail row a company domain", () => {
    // The job-change pair reaches the engine through a personal mailbox, so
    // neither row may claim a company domain from it.
    for (const id of ["r023", "r024"]) {
      expect(at(id).email.kind, id).toBe("freemail");
      expect(at(id).domain.source, id).toBe("none");
    }
  });
});

describe("the merge scenarios survive normalization", () => {
  const records = new Map(normalizeRows(demoRows(), CONFIG).map((record) => [record.id, record]));
  const at = (id: string) => records.get(id)!;

  it("reduces the alias pairs to one canonical address", () => {
    expect(at("r003").email.canonical).toBe(at("r004").email.canonical);
    expect(at("r005").email.canonical).toBe(at("r006").email.canonical);
    expect(at("r029").email.canonical).toBe(at("r030").email.canonical);
  });

  it("reduces every spelling of a shared line to one E.164", () => {
    for (const [a, b] of [
      ["r007", "r008"],
      ["r009", "r010"],
      ["r013", "r014"],
      ["r015", "r016"],
      ["r031", "r032"],
      ["r033", "r034"],
      ["r142", "r102"],
    ] as const) {
      expect(at(a).phone.e164, `${a}/${b}`).toBe(at(b).phone.e164);
    }
  });

  it("reduces every spelling of a company to one key", () => {
    for (const [a, b] of [
      ["r001", "r002"],
      ["r011", "r012"],
      ["r017", "r018"],
      ["r019", "r020"],
      ["r031", "r032"],
      ["r128", "r068"],
      ["r135", "r084"],
      ["r140", "r096"],
      ["r143", "r104"],
    ] as const) {
      expect(at(a).company.key, `${a}/${b}`).toBe(at(b).company.key);
    }
  });

  it("leaves the quarantine rows with no identity key at all", () => {
    for (const id of ["r061", "r062", "r063", "r064", "r065", "r066"]) {
      const record = at(id);
      const hasEmail = record.email.kind === "personal" || record.email.kind === "freemail";
      const hasPhone = record.phone.valid;
      const hasNameAndCompany = record.name.last !== undefined && record.company.key !== undefined;
      expect(hasEmail || hasPhone || hasNameAndCompany, id).toBe(false);
    }
  });
});
