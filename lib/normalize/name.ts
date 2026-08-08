/**
 * Person names: split, unaccented, honorific and suffix separated out.
 *
 * Two rules shape this module.
 *
 * **Nothing is thrown away.** Honorifics and generational suffixes are lifted
 * into their own fields rather than deleted, because `Robert Reyes Jr.` and
 * `Robert Reyes Sr.` are a father and son at the same company — the exact pair
 * a deduplicator merges when it treats `Jr.` as noise. The suffix is the only
 * evidence in the row that they are two people.
 *
 * **Every change is recorded.** A `NormNote` per transformation, in the words a
 * user would use, so a merge can always answer "why did you think those were
 * the same name?".
 *
 * Limitations, stated rather than hidden: the honorific and suffix lists are
 * English-language, and the multi-token surname handling covers European
 * particles (`van der`, `de la`) and little else. Names outside those
 * conventions still normalize and still match — they just get no help from this
 * module beyond case and accent folding.
 */

import { soundex } from "../text/phonetic.ts";
import { nameGroups } from "../text/nicknames.ts";
import type { NormalizedName, NormNote } from "../clean/types.ts";

const HONORIFICS = new Set([
  "mr", "mrs", "ms", "miss", "mx", "dr", "prof", "professor", "sir", "dame",
  "rev", "reverend", "fr", "father", "capt", "captain", "col", "colonel",
  "lt", "sgt", "hon", "eng", "ing",
]);

/**
 * Generational suffixes are kept as identity-bearing. Post-nominal credentials
 * (`phd`, `mba`) are stripped as decoration — they say what someone studied,
 * not which person they are.
 */
const GENERATIONAL = new Set(["jr", "jnr", "sr", "snr", "ii", "iii", "iv", "v"]);
const CREDENTIALS = new Set([
  "phd", "md", "mba", "cpa", "esq", "dds", "dvm", "rn", "jd", "cfa", "pe",
  "msc", "ma", "bsc", "ba", "cissp", "pmp",
]);

/** Tokens that belong to the surname that follows them. */
const PARTICLES = new Set([
  "van", "von", "de", "del", "della", "der", "den", "da", "das", "dos", "du",
  "la", "le", "el", "al", "bin", "binti", "ibn", "ter", "ten", "af", "av", "st",
]);

/** Diacritics folded away so Soundex and the string metrics see one alphabet. */
function fold(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}+/gu, "");
}

function tidyToken(token: string): string {
  return token.replace(/[.,]+$/g, "").replace(/^[.,]+/g, "");
}

/**
 * Title case that survives the shapes real names take: `mcdonald` ->
 * `McDonald`, `o'brien` -> `O'Brien`, `smith-jones` -> `Smith-Jones`. Deliberately
 * best-effort — it feeds `display` only, never a match key, so a name it
 * capitalizes oddly costs nothing but looks slightly wrong.
 */
export function titleCase(value: string): string {
  return value
    .split(" ")
    .map((word) => {
      if (word.length === 0) return word;
      const cased = word.replace(/(^|['’-])([\p{L}])/gu, (_, lead: string, letter: string) =>
        lead + letter.toUpperCase(),
      );
      if (/^mc[\p{L}]{2,}/u.test(word)) return "Mc" + cased[2].toUpperCase() + cased.slice(3);
      return cased;
    })
    .join(" ");
}

/** `jr` -> `Jr.`, but `iii` -> `III` — a roman numeral takes no period. */
function displaySuffix(suffix?: string): string | undefined {
  if (suffix === undefined) return undefined;
  return /^[iv]+$/.test(suffix) ? suffix.toUpperCase() : titleCase(suffix) + ".";
}

type Parts = { honorific?: string; suffix?: string; given: string[]; family: string[] };

/**
 * Splits a whole name into its parts.
 *
 * Handles the `Last, First` form separately, because a comma is the one
 * unambiguous signal about which side the surname is on — and guessing wrong
 * puts the wrong token into the blocking key, which loses the pair silently.
 */
function splitFullName(value: string): Parts {
  const [beforeComma, afterComma] = value.split(",", 2);
  const inverted = afterComma !== undefined && /[\p{L}]/u.test(afterComma);

  const ordered = inverted ? `${afterComma} ${beforeComma}` : value;
  const tokens = ordered.split(/\s+/).map(tidyToken).filter((token) => token.length > 0);

  const parts: Parts = { given: [], family: [] };
  const remaining: string[] = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (parts.honorific === undefined && remaining.length === 0 && HONORIFICS.has(lower)) {
      parts.honorific = lower;
      continue;
    }
    if (GENERATIONAL.has(lower)) {
      parts.suffix = lower;
      continue;
    }
    if (CREDENTIALS.has(lower)) continue;
    remaining.push(token);
  }

  if (remaining.length === 0) return parts;
  if (remaining.length === 1) {
    // One token and no way to tell which half it is. Treating it as the surname
    // is the safer guess: surnames drive blocking, and a lone token is far more
    // often a family name in list data.
    parts.family = remaining;
    return parts;
  }

  // A particle claims everything after it, so `van der Berg` stays one surname.
  const particleAt = remaining.findIndex(
    (token, index) => index > 0 && PARTICLES.has(token.toLowerCase()),
  );
  const boundary = particleAt === -1 ? remaining.length - 1 : particleAt;

  parts.given = remaining.slice(0, boundary);
  parts.family = remaining.slice(boundary);
  return parts;
}

export type NameInput = { fullName?: string; firstName?: string; lastName?: string };

export function normalizeName(input: NameInput): NormalizedName {
  const notes: NormNote[] = [];

  const explicit =
    (input.firstName?.trim() ?? "").length > 0 || (input.lastName?.trim() ?? "").length > 0;

  // Split columns win when present: they carry the answer the parser would have
  // to guess at. A `fullName` alongside them is only used to recover a missing half.
  const source = explicit
    ? `${input.firstName ?? ""} ${input.lastName ?? ""}`.trim()
    : (input.fullName ?? "").trim();

  if (source.length === 0) return { notes };

  const folded = fold(source);
  if (folded !== source) {
    notes.push({ rule: "folded accents to ASCII", from: source, to: folded });
  }

  const parts = explicit
    ? (() => {
        // Even with split columns, the halves need their own honorific/suffix
        // pass: `Dr. Robert` in a first-name column is common in exports.
        const first = splitFullName(fold(input.firstName ?? ""));
        const last = splitFullName(fold(input.lastName ?? ""));
        return {
          honorific: first.honorific ?? last.honorific,
          suffix: first.suffix ?? last.suffix,
          given: [...first.given, ...first.family],
          family: [...last.given, ...last.family],
        } satisfies Parts;
      })()
    : splitFullName(folded);

  const first = parts.given.join(" ").toLowerCase() || undefined;
  const last = parts.family.join(" ").toLowerCase() || undefined;

  if (parts.honorific !== undefined) {
    notes.push({ rule: "separated honorific from the name", from: source, to: parts.honorific });
  }
  if (parts.suffix !== undefined) {
    notes.push({
      rule: "kept generational suffix as part of the person's identity",
      from: source,
      to: parts.suffix,
    });
  }

  const groups = first === undefined ? new Set<string>() : nameGroups(first);
  const firstCanonical = groups.size === 1 ? [...groups][0] : undefined;
  if (firstCanonical !== undefined && firstCanonical !== first) {
    notes.push({ rule: "recognised a short form of a formal name", from: first!, to: firstCanonical });
  }

  const display = [
    first === undefined ? undefined : titleCase(first),
    last === undefined ? undefined : titleCase(last),
    displaySuffix(parts.suffix),
  ]
    .filter((piece) => piece !== undefined)
    .join(" ");

  return {
    first,
    last,
    honorific: parts.honorific,
    suffix: parts.suffix,
    firstCanonical,
    lastKey: last === undefined ? undefined : soundex(last),
    display: display.length > 0 ? display : undefined,
    notes,
  };
}
