/**
 * The two tiers, and the line between them.
 *
 * **Authoritative** means the engine merges the pair without asking. Only two
 * rules qualify, and each one is a statement about a *mailbox* or a *line* rather
 * than about a resemblance:
 *
 *   A1. the same personal mailbox
 *   A2. the same phone line, plus a name that agrees, plus the same employer
 *
 * **Probable** means a human decides. Everything built out of similarity lands
 * here — name resemblance, company resemblance, a shared domain — no matter how
 * high it scores. There is no threshold at which a resemblance is promoted to an
 * automatic merge, because the cost of being wrong is asymmetric: a missed merge
 * is a review item and a false merge is a person's record, gone.
 *
 * Every component of every score carries a human-readable reason. The `reasons`
 * array is what the review UI shows, and it is the artifact the project exists to
 * produce.
 */

import type { Edge, EdgeReason, NormalizedRecord } from "../clean/types.ts";
import { identifiesPerson } from "../normalize/email.ts";
import { lastSevenDigits } from "../normalize/phone.ts";
import { firstNameCompatibility } from "../text/nicknames.ts";
import { jaroWinkler } from "../text/jaro-winkler.ts";
import { tokenSetSimilarity } from "../text/token-set.ts";
import { orderedPair } from "./blocking.ts";

/** Probable-tier weights. They sum to 1 before any penalty. */
const WEIGHTS = { name: 0.45, company: 0.3, domain: 0.15, phone: 0.1 } as const;

/**
 * Two valid, different numbers is evidence *against* a pair — but weak evidence,
 * because people have a desk line and a mobile. Small enough that it cannot sink
 * a pair on its own, large enough to separate two colleagues who share a name.
 */
const DIFFERENT_PHONE_PENALTY = 0.1;

/** A1/A2 name agreement floors. Higher than the probable-tier gate, deliberately. */
const AUTHORITATIVE_SURNAME_MIN = 0.92;
const AUTHORITATIVE_GIVEN_MIN = 0.85;

export type NameAgreement = {
  score: number;
  surname: number;
  given: number;
  reasons: EdgeReason[];
};

/**
 * How much two names agree, surname-weighted.
 *
 * The surname carries more weight than the given name because it is the more
 * distinctive half in list data, and because the given name is where nicknames and
 * initials introduce most of the uncertainty. A missing surname on one side scores
 * 0.5 rather than 0 — absence is not disagreement — but it can never clear the
 * authoritative floor on its own.
 */
export function nameAgreement(a: NormalizedRecord, b: NormalizedRecord): NameAgreement {
  const reasons: EdgeReason[] = [];

  let surname: number;
  if (a.name.last !== undefined && b.name.last !== undefined) {
    surname = jaroWinkler(a.name.last, b.name.last);
    reasons.push({
      rule: "surname",
      verdict: surname >= 0.9 ? "match" : "mismatch",
      detail: `${a.name.last} vs ${b.name.last} — ${surname.toFixed(2)}`,
    });
  } else {
    surname = 0.5;
    reasons.push({
      rule: "surname",
      verdict: "mismatch",
      detail: "missing on one side, so it neither agrees nor disagrees",
    });
  }

  const first = firstNameCompatibility(a.name.first ?? "", b.name.first ?? "");
  reasons.push({
    rule: "given name",
    verdict: first.score >= 0.85 ? "match" : "mismatch",
    detail: `${first.rule} — ${first.score.toFixed(2)}`,
  });

  return { score: 0.6 * surname + 0.4 * first.score, surname, given: first.score, reasons };
}

function sameEmployer(a: NormalizedRecord, b: NormalizedRecord): boolean {
  if (a.company.key !== undefined && a.company.key === b.company.key) return true;
  return a.domain.value !== undefined && a.domain.value === b.domain.value;
}

/** A1: one personal mailbox, written two ways. */
function sameMailbox(a: NormalizedRecord, b: NormalizedRecord): Edge | undefined {
  if (!identifiesPerson(a.email.kind) || !identifiesPerson(b.email.kind)) return undefined;
  if (a.email.canonical === undefined || a.email.canonical !== b.email.canonical) return undefined;

  const [left, right] = orderedPair(a.id, b.id);
  return {
    a: left,
    b: right,
    kind: "authoritative",
    score: 1,
    reasons: [
      {
        rule: "identical personal mailbox",
        verdict: "match",
        detail: `${a.email.canonical} — a shared inbox would not qualify, a personal one is one human`,
      },
    ],
  };
}

/**
 * A2: one phone line, a name that agrees, and one employer.
 *
 * All three are required. The line alone is a switchboard; the line plus a name is
 * a switchboard where two colleagues happen to resemble each other; and a
 * *differing* extension on the same line is positive evidence of two desks, so it
 * blocks the rule outright.
 */
function samePhoneAndPerson(a: NormalizedRecord, b: NormalizedRecord): Edge | undefined {
  if (!a.phone.valid || !b.phone.valid) return undefined;
  if (a.phone.e164 === undefined || a.phone.e164 !== b.phone.e164) return undefined;

  const extensionsConflict =
    a.phone.extension !== undefined &&
    b.phone.extension !== undefined &&
    a.phone.extension !== b.phone.extension;
  if (extensionsConflict) return undefined;

  const name = nameAgreement(a, b);
  if (name.surname < AUTHORITATIVE_SURNAME_MIN || name.given < AUTHORITATIVE_GIVEN_MIN) return undefined;
  if (!sameEmployer(a, b)) return undefined;

  const [left, right] = orderedPair(a.id, b.id);
  return {
    a: left,
    b: right,
    kind: "authoritative",
    score: 1,
    reasons: [
      {
        rule: "identical phone line",
        verdict: "match",
        detail: `${a.phone.e164}${a.phone.extension !== undefined ? ` x${a.phone.extension}` : ""}`,
      },
      ...name.reasons,
      {
        rule: "same employer",
        verdict: "match",
        detail: a.company.key ?? a.domain.value ?? "",
      },
    ],
  };
}

/**
 * The probable tier: a weighted sum, gated on the name.
 *
 * The gate is what stops two strangers at one company from scoring well on
 * company and domain alone. Nothing merges — or even reaches review — on the
 * strength of a shared employer.
 */
function probable(a: NormalizedRecord, b: NormalizedRecord, nameGate: number): Edge {
  const [left, right] = orderedPair(a.id, b.id);
  const name = nameAgreement(a, b);
  const reasons: EdgeReason[] = [...name.reasons];

  if (name.score < nameGate) {
    return {
      a: left,
      b: right,
      kind: "probable",
      score: 0,
      reasons: [
        ...reasons,
        {
          rule: "name gate",
          verdict: "mismatch",
          detail: `${name.score.toFixed(2)} is below the ${nameGate.toFixed(2)} floor, so no amount of company or domain agreement can carry this pair`,
        },
      ],
    };
  }

  let score = WEIGHTS.name * name.score;
  reasons.push({
    rule: "name",
    verdict: name.score >= nameGate ? "match" : "mismatch",
    detail: `combined name agreement ${name.score.toFixed(2)}`,
    weight: WEIGHTS.name * name.score,
  });

  if (a.company.key !== undefined && b.company.key !== undefined) {
    const company = tokenSetSimilarity(a.company.key, b.company.key);
    score += WEIGHTS.company * company.score;
    reasons.push({
      rule: "company",
      verdict: company.score >= 0.8 ? "match" : "mismatch",
      detail: `${a.company.key} vs ${b.company.key} — ${company.score.toFixed(2)}`,
      weight: WEIGHTS.company * company.score,
    });
  }

  if (a.domain.value !== undefined && a.domain.value === b.domain.value) {
    score += WEIGHTS.domain;
    reasons.push({
      rule: "domain",
      verdict: "match",
      detail: a.domain.value,
      weight: WEIGHTS.domain,
    });
  }

  const leftSeven = lastSevenDigits(a.phone.e164);
  const rightSeven = lastSevenDigits(b.phone.e164);
  if (leftSeven !== undefined && leftSeven === rightSeven) {
    score += WEIGHTS.phone;
    reasons.push({
      rule: "phone",
      verdict: "match",
      detail: `same subscriber number ${leftSeven}`,
      weight: WEIGHTS.phone,
    });
  } else if (a.phone.valid && b.phone.valid) {
    score -= DIFFERENT_PHONE_PENALTY;
    reasons.push({
      rule: "phone",
      verdict: "mismatch",
      detail: `${a.phone.e164} vs ${b.phone.e164} — weak evidence of two people, since one person can have two numbers`,
      weight: -DIFFERENT_PHONE_PENALTY,
    });
  }

  return { a: left, b: right, kind: "probable", score: Math.max(0, Math.min(1, score)), reasons };
}

/**
 * Scores one pair. Refusals are handled by the caller, before this runs.
 */
export function scorePair(a: NormalizedRecord, b: NormalizedRecord, nameGate: number): Edge {
  return sameMailbox(a, b) ?? samePhoneAndPerson(a, b) ?? probable(a, b, nameGate);
}
