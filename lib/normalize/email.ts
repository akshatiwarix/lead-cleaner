/**
 * Email addresses: cleaned, classified, and canonicalised *visibly*.
 *
 * The classification is the important output. `kind` answers two separate
 * questions that get conflated constantly:
 *
 *   - **Is this a person?** `personal` and `freemail` are one human's mailbox.
 *     `role` is a shared inbox — three people at `info@acme.example` are three
 *     people, and merging them is the most common false merge in real CRM data.
 *   - **Is this a company?** Only `personal`. A `gmail.com` address says nothing
 *     about where someone works, which is why `freemail` is its own kind rather
 *     than folded into `personal`.
 *
 * Canonicalisation is *recorded*, never silent. `b.reyes+list@gmail.com` and
 * `breyes@gmail.com` are the same mailbox, and acting on that is right — but a
 * user who cannot see that the tool rewrote their address before merging on it
 * has no way to audit the merge. Hence a `NormNote` per rewrite.
 */

import { isPlaceholder } from "./placeholder.ts";
import type { NormalizedEmail, NormNote } from "../clean/types.ts";

/**
 * Shared inboxes. Not exhaustive and it cannot be — the list is the cheap 90%,
 * and anything it misses is a false merge waiting to happen, which is why the
 * authoritative tier also requires the *rest* of the record to agree.
 */
const ROLE_LOCAL_PARTS = new Set([
  "info", "information", "sales", "support", "hello", "hi", "contact", "contactus",
  "admin", "administrator", "office", "team", "help", "helpdesk", "billing",
  "accounts", "accounting", "ap", "ar", "invoices", "careers", "jobs", "recruiting",
  "hr", "people", "marketing", "press", "media", "pr", "legal", "privacy",
  "security", "abuse", "postmaster", "webmaster", "hostmaster", "noreply",
  "no-reply", "donotreply", "do-not-reply", "enquiries", "inquiries", "general",
  "mail", "email", "service", "customerservice", "orders", "shop", "partners",
  "partnerships", "investors", "ir", "finance", "dev", "developers", "api",
  "newsletter", "subscribe", "unsubscribe", "feedback", "everyone", "all", "staff",
]);

/** Consumer mailbox providers: a real person, but no signal about their employer. */
const FREEMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.co.in",
  "yahoo.fr", "yahoo.de", "ymail.com", "rocketmail.com", "hotmail.com",
  "hotmail.co.uk", "hotmail.fr", "hotmail.de", "outlook.com", "outlook.in",
  "live.com", "live.co.uk", "msn.com", "aol.com", "icloud.com", "me.com",
  "mac.com", "protonmail.com", "protonmail.ch", "proton.me", "pm.me", "gmx.com",
  "gmx.de", "gmx.net", "mail.com", "mail.ru", "yandex.com", "yandex.ru",
  "zoho.com", "fastmail.com", "hushmail.com", "tutanota.com", "tuta.io",
  "rediffmail.com", "qq.com", "163.com", "126.com", "sina.com", "naver.com",
  "daum.net", "hanmail.net", "web.de", "t-online.de", "freenet.de", "orange.fr",
  "wanadoo.fr", "laposte.net", "free.fr", "sfr.fr", "libero.it", "virgilio.it",
  "alice.it", "seznam.cz", "bol.com.br", "uol.com.br", "terra.com.br",
  "btinternet.com", "sky.com", "virginmedia.com", "comcast.net", "verizon.net",
  "att.net", "sbcglobal.net", "bellsouth.net", "cox.net", "charter.net",
  "shaw.ca", "rogers.com", "telus.net", "bigpond.com", "optusnet.com.au",

  // Reserved-domain stand-ins, listed so the bundled dataset can exercise the
  // free-mail path without putting a real person's mailbox in a public repo.
  // `.example` is reserved by RFC 2606 and can never be registered, so these
  // cost nothing in production and keep data/leads.test.ts's "no real domain"
  // assertion absolute.
  "mailbox.example", "webmail.example",
]);

/**
 * Only these strip dots from the local part; elsewhere dots are significant.
 * `mailbox.example` is the reserved stand-in for a dot-insensitive provider.
 */
const DOT_INSENSITIVE_DOMAINS = new Set(["gmail.com", "googlemail.com", "mailbox.example"]);

/**
 * Deliberately permissive on the local part and strict about the shape: exactly
 * one `@`, no whitespace, and a dotted domain whose last label is alphabetic.
 * A full RFC 5322 grammar would accept quoted strings and comments that no lead
 * list has ever contained, and rejecting the addresses people actually mistype
 * matters far more than accepting the ones the spec permits.
 */
const SHAPE = /^[^\s@,;:<>()[\]\\"]+@(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+[\p{L}]{2,}$/u;

export function isFreemailDomain(domain: string): boolean {
  return FREEMAIL_DOMAINS.has(domain.toLowerCase());
}

export function isRoleLocalPart(localPart: string): boolean {
  // The tag is dropped first, so `sales+eu@` classifies as the role it is.
  const withoutTag = localPart.split("+", 1)[0];
  return ROLE_LOCAL_PARTS.has(withoutTag.replace(/[._-]/g, ""));
}

/** `personal` and `freemail` are one human's mailbox; `role` is a shared one. */
export function identifiesPerson(kind: NormalizedEmail["kind"]): boolean {
  return kind === "personal" || kind === "freemail";
}

/** Only a corporate address says anything about where its owner works. */
export function identifiesCompany(kind: NormalizedEmail["kind"]): boolean {
  return kind === "personal";
}

export function normalizeEmail(raw?: string): NormalizedEmail {
  const notes: NormNote[] = [];
  const input = (raw ?? "").trim();
  if (input.length === 0) return { kind: "missing", notes };
  if (isPlaceholder(input)) {
    // `unknown` is a missing address, not a malformed one — the distinction
    // matters, because `invalid` reads as a data-quality problem to fix.
    notes.push({ rule: "dropped a placeholder standing in for a missing address", from: input, to: "" });
    return { kind: "missing", notes };
  }

  // Exports arrive with display wrappers around the address more often than not.
  const normalized = input
    .replace(/^mailto:/i, "")
    .replace(/^[^<]*<([^>]*)>.*$/, "$1")
    .trim()
    .toLowerCase();

  if (normalized !== input) {
    notes.push({ rule: "trimmed and lower-cased the address", from: input, to: normalized });
  }

  if (!SHAPE.test(normalized)) {
    return { normalized, kind: "invalid", notes };
  }

  const at = normalized.lastIndexOf("@");
  const localPart = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);

  let canonicalLocal = localPart;

  const plus = canonicalLocal.indexOf("+");
  if (plus !== -1) {
    const stripped = canonicalLocal.slice(0, plus);
    notes.push({
      rule: "dropped the +tag, which routes to the same mailbox",
      from: canonicalLocal,
      to: stripped,
    });
    canonicalLocal = stripped;
  }

  if (DOT_INSENSITIVE_DOMAINS.has(domain) && canonicalLocal.includes(".")) {
    const stripped = canonicalLocal.replace(/\./g, "");
    notes.push({
      rule: `dropped dots, which ${domain} ignores`,
      from: canonicalLocal,
      to: stripped,
    });
    canonicalLocal = stripped;
  }

  // A local part that was *only* a tag or dots leaves nothing to identify.
  if (canonicalLocal.length === 0) {
    return { normalized, localPart, domain, kind: "invalid", notes };
  }

  const kind: NormalizedEmail["kind"] = isRoleLocalPart(localPart)
    ? "role"
    : isFreemailDomain(domain)
      ? "freemail"
      : "personal";

  if (kind === "role") {
    notes.push({
      rule: "shared inbox, so it identifies a company and not a person",
      from: normalized,
      to: localPart.split("+", 1)[0],
    });
  }
  if (kind === "freemail") {
    notes.push({
      rule: "consumer mailbox, so it identifies a person but not an employer",
      from: normalized,
      to: domain,
    });
  }

  return {
    normalized,
    canonical: `${canonicalLocal}@${domain}`,
    localPart,
    domain,
    kind,
    notes,
  };
}
