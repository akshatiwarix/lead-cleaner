/**
 * Phone numbers to E.164, with the extension pulled out separately.
 *
 * E.164 matters here because phone is an *authoritative* match signal — a shared
 * mobile number plus a compatible name auto-merges — and that only works if
 * `(555) 019-2837`, `555.019.2837` and `+1 555 019 2837` reduce to one string.
 * Two spellings of one number that fail to compare equal is a missed merge in
 * every row it touches.
 *
 * The extension is separated rather than kept in the number for the same reason
 * from the other direction: `+15550192837 x204` and `+15550192837 x881` are two
 * people at one switchboard. Folding the extension into the number would make
 * them look identical; dropping it would lose the only thing telling them apart.
 * So it is parsed, stored, and then deliberately *not* part of `e164`.
 *
 * This is a small region table, not libphonenumber. It covers the metadata that
 * actually matters — country code, national number length, trunk prefix — for a
 * handful of regions, and refuses anything it cannot place rather than emitting a
 * confident wrong answer. The limitation is in the README.
 */

import { isPlaceholder } from "./placeholder.ts";
import type { NormalizedPhone, NormNote } from "../clean/types.ts";

type Region = {
  /** Country calling code, without the plus. */
  code: string;
  /** Valid national-number lengths, after any trunk prefix is removed. */
  lengths: number[];
  /** The leading digit domestic dialling adds, if the region uses one. */
  trunk?: string;
};

const REGIONS: Record<string, Region> = {
  US: { code: "1", lengths: [10] },
  CA: { code: "1", lengths: [10] },
  GB: { code: "44", lengths: [10, 9], trunk: "0" },
  IE: { code: "353", lengths: [9, 8], trunk: "0" },
  IN: { code: "91", lengths: [10], trunk: "0" },
  AU: { code: "61", lengths: [9], trunk: "0" },
  NZ: { code: "64", lengths: [9, 8], trunk: "0" },
  DE: { code: "49", lengths: [11, 10, 9], trunk: "0" },
  FR: { code: "33", lengths: [9], trunk: "0" },
  NL: { code: "31", lengths: [9], trunk: "0" },
  ES: { code: "34", lengths: [9] },
  IT: { code: "39", lengths: [10, 9] },
  SE: { code: "46", lengths: [9, 8], trunk: "0" },
  SG: { code: "65", lengths: [8] },
  JP: { code: "81", lengths: [10, 9], trunk: "0" },
  BR: { code: "55", lengths: [11, 10], trunk: "0" },
  ZA: { code: "27", lengths: [9], trunk: "0" },
  AE: { code: "971", lengths: [9], trunk: "0" },
};

/** Every calling code the table knows, longest first so `+1` cannot shadow `+91`. */
const KNOWN_CODES = [...new Set(Object.values(REGIONS).map((region) => region.code))].sort(
  (a, b) => b.length - a.length,
);

/**
 * Alternatives are ordered longest-first so `extension` is not eaten by `ext`.
 * The lookbehind is what keeps `x` from firing inside a word — without it the
 * `x` in `fax: 555…` reads as an extension marker. A `\b` after `x` cannot do
 * this job, because `x12` has no word boundary between the letter and the digit.
 */
const EXTENSION = /(?<![\p{L}])(?:(?:extension|extn|ext|xt|x)\.?|#)\s*[:.]?\s*(\d{1,6})\s*$/iu;

/**
 * The last seven digits of a number, or undefined if there are fewer.
 *
 * A blocking key, and a scoring signal for the case a list export produces
 * constantly: the same line written once with a country code and once without.
 * Seven digits is the subscriber part in most numbering plans — short enough to
 * survive a missing prefix, long enough that a collision is worth comparing.
 */
export function lastSevenDigits(e164?: string): string | undefined {
  if (e164 === undefined) return undefined;
  const digits = e164.replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-7) : undefined;
}

export function normalizePhone(raw: string | undefined, defaultRegion: string): NormalizedPhone {
  const notes: NormNote[] = [];
  const input = (raw ?? "").trim();
  if (input.length === 0) return { valid: false, notes };
  if (isPlaceholder(input)) {
    notes.push({ rule: "dropped a placeholder standing in for a missing number", from: input, to: "" });
    return { valid: false, notes };
  }

  let body = input;
  let extension: string | undefined;

  const withExtension = EXTENSION.exec(body);
  if (withExtension) {
    extension = withExtension[1];
    body = body.slice(0, withExtension.index).trim();
    notes.push({
      rule: "separated the extension, which distinguishes people on one switchboard",
      from: input,
      to: extension,
    });
  }

  const hadPlus = body.trimStart().startsWith("+") || body.startsWith("00");
  const digits = body.replace(/\D/g, "");

  if (digits.length === 0) {
    notes.push({ rule: "no digits to read", from: input, to: "" });
    return { extension, valid: false, notes };
  }

  const region = REGIONS[defaultRegion.toUpperCase()];

  // An international prefix is an explicit statement about the country code, so
  // it always beats the configured default region.
  if (hadPlus) {
    const international = body.trimStart().startsWith("+") ? digits : digits.slice(2);
    const code = KNOWN_CODES.find((candidate) => international.startsWith(candidate));

    if (code === undefined) {
      // A plausible-length international number in a country the table does not
      // know. Accepting the digits as given is better than refusing a number
      // the user wrote in the correct format.
      if (international.length >= 8 && international.length <= 15) {
        const e164 = `+${international}`;
        notes.push({ rule: "kept an international number from an unlisted country", from: input, to: e164 });
        return { e164, extension, valid: true, notes };
      }
      notes.push({ rule: "not a usable international number", from: input, to: international });
      return { extension, valid: false, notes };
    }

    const national = international.slice(code.length);
    const e164 = `+${code}${national}`;
    const lengths = Object.values(REGIONS).find((entry) => entry.code === code)!.lengths;
    const valid = lengths.includes(national.length);
    notes.push({
      rule: valid ? "read as an international number" : "international number is the wrong length",
      from: input,
      to: e164,
    });
    return { e164, extension, valid, notes };
  }

  if (region === undefined) {
    notes.push({ rule: `no dialling rules for region ${defaultRegion}`, from: input, to: digits });
    return { extension, valid: false, notes };
  }

  // A number that already starts with its own country code but no plus — common
  // in exports that lost the formatting.
  if (digits.startsWith(region.code) && region.lengths.includes(digits.length - region.code.length)) {
    const e164 = `+${digits}`;
    notes.push({ rule: "recovered a country code written without a plus", from: input, to: e164 });
    return { e164, extension, valid: true, notes };
  }

  let national = digits;
  if (region.trunk !== undefined && national.startsWith(region.trunk)) {
    national = national.slice(region.trunk.length);
    notes.push({ rule: "removed the domestic trunk prefix", from: digits, to: national });
  }

  if (!region.lengths.includes(national.length)) {
    notes.push({
      rule: `wrong length for a ${defaultRegion.toUpperCase()} number`,
      from: input,
      to: national,
    });
    return { extension, valid: false, notes };
  }

  const e164 = `+${region.code}${national}`;
  notes.push({
    rule: `formatted as E.164 using the ${defaultRegion.toUpperCase()} default region`,
    from: input,
    to: e164,
  });
  return { e164, extension, valid: true, notes };
}
