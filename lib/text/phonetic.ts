/**
 * Soundex — a phonetic key, used for *blocking* and nothing else.
 *
 * Blocking's job is to decide which pairs are worth comparing at all. It is
 * allowed to be crude, because it is never allowed to decide anything: every
 * pair it produces still goes through the full rule set, and every pair it
 * misses is a recall loss bounded by a test (`lib/match/blocking.test.ts`
 * compares blocking's pairs against the exhaustive comparator's).
 *
 * So Soundex's well-known weaknesses are acceptable here in a way they would not
 * be in a matcher. It is Anglocentric, it splits names that begin with different
 * letters (`Chen` / `Shen`), and it collides freely (`Robert` and `Rupert` share
 * a key). The first two cost recall, which other blocking keys make up; the
 * third costs a few extra comparisons, which is what a blocking key is for.
 */

const CODES: Record<string, string> = {
  B: "1", F: "1", P: "1", V: "1",
  C: "2", G: "2", J: "2", K: "2", Q: "2", S: "2", X: "2", Z: "2",
  D: "3", T: "3",
  L: "4",
  M: "5", N: "5",
  R: "6",
};

/** Vowels code as 0: they separate, so `Tymczak` keeps both its 2s. */
const VOWELS = new Set(["A", "E", "I", "O", "U", "Y"]);

/**
 * `H` and `W` are neither coded nor separating — two consonants either side of
 * one collapse as if it were not there (`Ashcraft` -> `A261`, not `A226`). This
 * is the rule most Soundex implementations get wrong.
 */
const TRANSPARENT = new Set(["H", "W"]);

/**
 * Returns a four-character key, or an empty string for input with no letters.
 * The letters are taken as ASCII, so callers should hand over an
 * already-transliterated string; `lib/normalize/name.ts` strips diacritics
 * before this sees anything.
 */
export function soundex(value: string): string {
  const letters = value.toUpperCase().replace(/[^A-Z]/g, "");
  if (letters.length === 0) return "";

  const first = letters[0];
  let key = first;
  // The first letter's own code seeds the duplicate check, so `Pfister` is `P236`
  // rather than `P123`.
  let previous = CODES[first] ?? "0";

  for (const letter of letters.slice(1)) {
    if (TRANSPARENT.has(letter)) continue;

    const code = VOWELS.has(letter) ? "0" : CODES[letter];
    if (code === undefined) continue;

    if (code !== "0" && code !== previous) key += code;
    previous = code;

    if (key.length === 4) break;
  }

  return key.padEnd(4, "0");
}
