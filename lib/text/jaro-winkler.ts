/**
 * Jaro and Jaro-Winkler string similarity.
 *
 * Written out rather than installed. A dependency here would hide the one part
 * of a deduplicator a reader actually wants to inspect: what "similar enough"
 * means, and where the number comes from.
 *
 * Jaro-Winkler is the right default for *person names* specifically. It is
 * tolerant of the transpositions and single-character typos that human data
 * entry produces (`Jonathon` / `Johnathon`), and its prefix boost matches how
 * names behave — people mistype the end of a name far more often than the
 * start. It is a poor choice for company names, where token order varies and
 * whole words go missing; `token-set.ts` handles those.
 */

/**
 * Jaro similarity: the share of characters that match within a sliding window,
 * discounted by how many of those matches are out of order.
 *
 * Returns 0..1. Two empty strings are 1 (nothing disagrees); one empty string
 * against a non-empty one is 0.
 */
export function jaro(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  // Characters may match if they sit within half the longer string's length of
  // each other. This is what makes the measure tolerant of insertions.
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);

  const aMatched = new Array<boolean>(a.length).fill(false);
  const bMatched = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const from = Math.max(0, i - window);
    const to = Math.min(b.length - 1, i + window);
    for (let j = from; j <= to; j++) {
      if (bMatched[j] || a[i] !== b[j]) continue;
      aMatched[i] = true;
      bMatched[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // A transposition is a pair of matched characters that appear in a different
  // order in each string. Walking both match lists in step counts them.
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatched[i]) continue;
    while (!bMatched[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  const half = transpositions / 2;
  return (matches / a.length + matches / b.length + (matches - half) / matches) / 3;
}

/** Standard Winkler constants: 0.1 per shared prefix character, up to four. */
const PREFIX_SCALE = 0.1;
const MAX_PREFIX = 4;
/**
 * Below this, the strings are too different for a shared prefix to mean
 * anything, and boosting would only make unrelated names look related.
 */
const BOOST_THRESHOLD = 0.7;

/**
 * Jaro-Winkler: Jaro, with a bonus for a shared prefix.
 *
 * Case and surrounding whitespace are the caller's problem — everything reaching
 * this function has already been through `lib/normalize`, and silently
 * lower-casing here would mean two modules own the same decision.
 */
export function jaroWinkler(a: string, b: string): number {
  const base = jaro(a, b);
  if (base < BOOST_THRESHOLD) return base;

  let prefix = 0;
  const limit = Math.min(MAX_PREFIX, a.length, b.length);
  while (prefix < limit && a[prefix] === b[prefix]) prefix++;

  return base + prefix * PREFIX_SCALE * (1 - base);
}
