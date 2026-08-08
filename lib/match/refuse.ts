/**
 * The pairs that cannot be the same person, whatever else agrees.
 *
 * Refusals are evaluated **first** and win outright. That ordering is the
 * project's central bet: a false merge is unrecoverable, so evidence *against* a
 * pair is worth more than evidence for it, and a rule that says "not this one"
 * must be able to beat an otherwise-authoritative match. `Ryan Doyle` at two
 * companies sharing a phone line is in the dataset to prove that a shared line
 * does not override a refusal.
 *
 * Each rule below is a claim strong enough to justify that power, and each one is
 * narrow on purpose — a refusal that fires too often destroys recall as
 * thoroughly as a bad merge destroys data.
 */

import type { Constraint, EdgeReason, NormalizedRecord } from "../clean/types.ts";
import { pairKey } from "./blocking.ts";

/**
 * A human's rejection. The reviewer looked at the pair and said no, so nothing
 * the scoring finds later is allowed to overrule them.
 */
function humanRefusal(a: NormalizedRecord, b: NormalizedRecord, mustNotLink: Set<string>): EdgeReason | undefined {
  if (!mustNotLink.has(pairKey(a.id, b.id))) return undefined;
  return {
    rule: "reviewer marked these as different people",
    verdict: "refuse",
    detail: "a must-not-link decision is final; scoring cannot overrule it",
  };
}

/**
 * Two different corporate mailboxes at two different employers.
 *
 * This is the honest hard case in the whole project. `Daniel Whitfield` at
 * Kestrel and `Daniel Whitfield` at Meridian is *either* one person who changed
 * jobs *or* two people who share a name, and nothing in the two rows can tell
 * you which. Merging costs a person's record; refusing costs a duplicate. So it
 * refuses, and the tradeoff is in the README rather than buried here.
 *
 * Deliberately restricted to `personal` addresses. A consumer mailbox follows its
 * owner between employers, so `t.ferreira@mailbox.example` at two companies is
 * one person — that pair merges, and the disagreeing company is reported as a
 * conflict instead.
 */
function differentEmployers(a: NormalizedRecord, b: NormalizedRecord): EdgeReason | undefined {
  if (a.email.kind !== "personal" || b.email.kind !== "personal") return undefined;
  if (a.email.canonical === undefined || b.email.canonical === undefined) return undefined;
  if (a.email.canonical === b.email.canonical) return undefined;
  if (a.email.domain === b.email.domain) return undefined;

  return {
    rule: "different corporate mailboxes at different employers",
    verdict: "refuse",
    detail: `${a.email.canonical} and ${b.email.canonical} — a job change and two people with one name are indistinguishable from these rows, and merging is the unrecoverable choice`,
  };
}

/**
 * A generational suffix that disagrees.
 *
 * `Robert Reyes Sr.` and `Robert Reyes Jr.` share a name, an employer, a domain
 * and often a phone. Every similarity signal in the system says one person. The
 * suffix is the only field that says two, and it is the reason `lib/normalize/name.ts`
 * keeps suffixes instead of stripping them as noise.
 */
function generationalMismatch(a: NormalizedRecord, b: NormalizedRecord): EdgeReason | undefined {
  const left = a.name.suffix;
  const right = b.name.suffix;
  if (left === undefined || right === undefined || left === right) return undefined;

  return {
    rule: "generational suffixes disagree",
    verdict: "refuse",
    detail: `${left.toUpperCase()} and ${right.toUpperCase()} — a father and son share everything else, and this is the only field that separates them`,
  };
}

/** In evaluation order. The first to fire ends the pair. */
const RULES = [differentEmployers, generationalMismatch];

/**
 * Why this pair cannot be one person, or undefined if nothing refutes it.
 */
export function refusalFor(
  a: NormalizedRecord,
  b: NormalizedRecord,
  mustNotLink: Set<string>,
): EdgeReason | undefined {
  const human = humanRefusal(a, b, mustNotLink);
  if (human !== undefined) return human;

  for (const rule of RULES) {
    const refusal = rule(a, b);
    if (refusal !== undefined) return refusal;
  }
  return undefined;
}

/** The must-not-link pairs a caller declared, as canonical pair keys. */
export function mustNotLinkSet(constraints: Constraint[]): Set<string> {
  return new Set(
    constraints
      .filter((constraint) => constraint.kind === "must-not-link")
      .map((constraint) => pairKey(constraint.a, constraint.b)),
  );
}
