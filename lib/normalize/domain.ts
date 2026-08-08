/**
 * The company domain — the single strongest company signal in a lead row.
 *
 * A domain beats a company name because it is already canonical: `acme.example`
 * is spelled one way, where the name it belongs to is spelled six. So it is worth
 * recovering from wherever it is hiding, in preference order:
 *
 *   1. an explicit website column
 *   2. the domain of a *corporate* email address
 *
 * A consumer mailbox is not a company domain, and this is the rule that matters.
 * If `gmail.com` were allowed through, every person with a personal address would
 * share a "company" domain with every other, and the domain signal — which the
 * match rules weight heavily — would silently start pointing at nothing. Same for
 * a website column someone filled in with their own webmail address.
 *
 * Public-suffix handling is deliberately absent: the domain is compared to other
 * domains for equality, never decomposed into a registrable part, so a suffix
 * list would be code with no caller.
 */

import { isFreemailDomain } from "./email.ts";
import type { NormalizedDomain, NormalizedEmail } from "../clean/types.ts";

/**
 * Pulls a bare host out of whatever a website column contains — a URL, a host
 * with a path, an email address someone put in the wrong column, or a host with
 * a stray port or trailing dot.
 */
export function hostFrom(value: string): string | undefined {
  let working = value.trim().toLowerCase();
  if (working.length === 0) return undefined;

  working = working.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  // A website column containing an email address is common enough to handle.
  const at = working.lastIndexOf("@");
  if (at !== -1) working = working.slice(at + 1);

  working = working.split(/[/?#]/, 1)[0];
  working = working.replace(/:\d+$/, "");
  working = working.replace(/\.+$/, "");
  working = working.replace(/^www\./, "");

  // Must look like a host: at least one dot, and an alphabetic last label.
  if (!/^(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+[\p{L}]{2,}$/u.test(working)) {
    return undefined;
  }
  return working;
}

export function normalizeDomain(website: string | undefined, email: NormalizedEmail): NormalizedDomain {
  const fromWebsite = website === undefined ? undefined : hostFrom(website);
  if (fromWebsite !== undefined && !isFreemailDomain(fromWebsite)) {
    return { value: fromWebsite, source: "website" };
  }

  // `personal` is the only email kind that carries an employer. A `freemail`
  // address identifies its owner perfectly well and says nothing about where
  // they work — see the EmailKind docs.
  if (email.kind === "personal" && email.domain !== undefined) {
    return { value: email.domain, source: "email" };
  }

  return { source: "none" };
}
