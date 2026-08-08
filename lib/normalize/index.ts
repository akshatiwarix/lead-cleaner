/**
 * One row in, one `NormalizedRecord` out.
 *
 * The field modules do the work; this file is the assembly and the ordering. The
 * ordering is not arbitrary — email is normalized before domain, because a
 * corporate address is where the domain comes from when no website column
 * exists, and the email's *kind* is what decides whether that is allowed.
 *
 * Nothing here decides anything about identity. That is `lib/match`'s job, and
 * keeping the split means a normalization change cannot quietly alter which
 * records merge without a match test noticing.
 */

import type { CleanConfig, InputRow, NormalizedRecord } from "../clean/types.ts";
import { normalizeCompany } from "./company.ts";
import { normalizeDomain } from "./domain.ts";
import { normalizeEmail } from "./email.ts";
import { normalizeName } from "./name.ts";
import { normalizePhone } from "./phone.ts";
import { normalizeTimestamp } from "./timestamp.ts";

/**
 * Titles get case and whitespace and nothing else. Seniority and function
 * extraction is Day 011 (`title-normalizer`); doing it here would be a second
 * project's worth of rules hiding inside this one, and the title never enters a
 * match decision.
 */
/** Lower-cased inside a title rather than capitalised. */
const TITLE_STOPWORDS = new Set([
  "of", "the", "and", "for", "to", "at", "in", "on", "a", "an", "or", "de",
]);

/** Acronyms long enough that the length heuristic would title-case them. */
const LONGER_ACRONYMS = new Set(["ciso", "revops", "saas", "paas", "iaas", "b2b", "b2c", "erp", "crm"]);

function tidyTitle(raw?: string): { raw?: string; tidied?: string } {
  const input = (raw ?? "").trim().replace(/\s+/g, " ");
  if (input.length === 0) return {};

  // Only shouted titles get rewritten; a title someone cased deliberately is
  // left exactly as they wrote it.
  const allCaps = input === input.toUpperCase() && /[\p{Lu}]{4,}/u.test(input);
  const tidied = allCaps
    ? input
        .split(" ")
        .map((word) => {
          const lower = word.toLowerCase();
          if (TITLE_STOPWORDS.has(lower.replace(/[^\p{L}]/gu, ""))) return lower;
          // `VP`, `CEO`, `RVP`, `GTM` — three letters or fewer is nearly always
          // an acronym in a job title, and `Vp` reads worse than `VP`. Four is
          // not: `HEAD`, `LEAD` and `DATA` are all words, so anything longer has
          // to be listed by hand.
          const letters = word.replace(/[^\p{L}]/gu, "");
          if (letters.length <= 3 || LONGER_ACRONYMS.has(lower.replace(/[^\p{L}]/gu, ""))) {
            return word;
          }
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(" ")
    : input;

  return { raw: input, tidied };
}

/** Source labels are compared against `config.sourceTrust`, so they need one spelling. */
function normalizeSource(raw?: string): string | undefined {
  const input = (raw ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  return input.length > 0 ? input : undefined;
}

export function normalizeRow(row: InputRow, config: CleanConfig): NormalizedRecord {
  const email = normalizeEmail(row.mapped.email);

  return {
    id: row.id,
    name: normalizeName(row.mapped),
    email,
    phone: normalizePhone(row.mapped.phone, config.defaultPhoneRegion),
    company: normalizeCompany(row.mapped.company),
    domain: normalizeDomain(row.mapped.website, email),
    title: tidyTitle(row.mapped.title),
    source: normalizeSource(row.mapped.source),
    updatedAt: normalizeTimestamp(row.mapped.updatedAt),
  };
}

export function normalizeRows(rows: InputRow[], config: CleanConfig): NormalizedRecord[] {
  return rows.map((row) => normalizeRow(row, config));
}

/**
 * Every recorded transformation for one record, flattened for display.
 *
 * The per-field note lists are the source of truth; this is the version the UI
 * shows when someone asks what the tool did to a row before comparing it.
 */
export function notesFor(record: NormalizedRecord): { field: string; rule: string; from: string; to: string }[] {
  return [
    ...record.name.notes.map((note) => ({ field: "name", ...note })),
    ...record.email.notes.map((note) => ({ field: "email", ...note })),
    ...record.phone.notes.map((note) => ({ field: "phone", ...note })),
    ...record.company.notes.map((note) => ({ field: "company", ...note })),
  ];
}
