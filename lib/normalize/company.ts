/**
 * Company names: legal form stripped, punctuation flattened, one match key out.
 *
 * `Acme, Inc.`, `ACME Inc`, `Acme Incorporated` and `The Acme Company` are one
 * company written four ways, and in this project company is never the thing
 * being deduplicated — it is a *blocking key* and a *guard*. Both jobs need the
 * same key: blocking has to put colleagues in one bucket, and the guard has to
 * notice when two same-named people work at different places.
 *
 * The guard is why the suffix list stops where it does. `Inc`, `LLC` and `GmbH`
 * are legal wrappers around the same name. `Group`, `Holdings`, `Labs`,
 * `Partners` and `Ventures` look like wrappers and are not: `Acme` and `Acme
 * Holdings` are frequently two entities, and stripping the distinction would
 * collapse a parent into its subsidiary. Those stay.
 */

import { isPlaceholder } from "./placeholder.ts";
import type { NormalizedCompany, NormNote } from "../clean/types.ts";

/**
 * Legal forms, longest-phrase-first so `private limited` is removed whole rather
 * than leaving `private` behind.
 */
const LEGAL_SUFFIXES = [
  "private limited",
  "pvt ltd",
  "pty ltd",
  "pte ltd",
  "kabushiki kaisha",
  "incorporated",
  "corporation",
  "limited",
  "company",
  "and co",
  "inc",
  "llc",
  "lllp",
  "llp",
  "lp",
  "ltd",
  "plc",
  "corp",
  "co",
  "gmbh",
  "mbh",
  "ag",
  "kg",
  "kgaa",
  "ohg",
  "sa",
  "sas",
  "sarl",
  "sl",
  "srl",
  "spa",
  "bv",
  "nv",
  "ab",
  "as",
  "oy",
  "oyj",
  "aps",
  "kk",
  "pty",
  "pte",
  "pvt",
  "sdn bhd",
  "bhd",
  "dba",
];

function fold(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}+/gu, "");
}

/**
 * Punctuation becomes space, `&` becomes `and`.
 *
 * `&` is spelled both ways by the same company in the same export, so the
 * expansion is worth the small cost of `A&B` becoming three tokens.
 */
function flatten(value: string): string {
  return value
    // `S.A.` and `B.V.` have to become one token before the suffix list can see
    // them — flattening punctuation first turns them into `s a`, which matches
    // nothing and leaves the legal form in the key.
    .replace(/(?:\p{L}\.){2,}/gu, (acronym) => acronym.replace(/\./g, ""))
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCompany(raw?: string): NormalizedCompany {
  const notes: NormNote[] = [];
  const input = (raw ?? "").trim();
  if (input.length === 0) return { notes };
  if (isPlaceholder(input)) {
    notes.push({ rule: "dropped a placeholder standing in for a missing company", from: input, to: "" });
    return { notes };
  }

  const folded = fold(input);
  if (folded !== input) {
    notes.push({ rule: "folded accents to ASCII", from: input, to: folded });
  }

  let working = flatten(folded).toLowerCase();
  if (working.length === 0) {
    notes.push({ rule: "no letters or digits in the company name", from: input, to: "" });
    return { notes };
  }

  if (working.startsWith("the ")) {
    const without = working.slice(4);
    notes.push({ rule: "dropped a leading `the`", from: working, to: without });
    working = without;
  }

  // Repeated because real data stacks them: `Acme Holdings Ltd Inc`.
  let stripping = true;
  while (stripping) {
    stripping = false;
    for (const suffix of LEGAL_SUFFIXES) {
      if (!working.endsWith(` ${suffix}`)) continue;
      const without = working.slice(0, -(suffix.length + 1)).trim();
      // Never strip a name down to nothing: a company literally called `Co` has
      // to keep its only token.
      if (without.length === 0) continue;
      notes.push({ rule: `dropped the legal form \`${suffix}\``, from: working, to: without });
      working = without;
      stripping = true;
      break;
    }
  }

  return {
    normalized: working
      .split(" ")
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
      .join(" "),
    key: working,
    notes,
  };
}
