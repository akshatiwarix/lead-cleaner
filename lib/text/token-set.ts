/**
 * Order-insensitive similarity for multi-word strings — company names, here.
 *
 * Company names fail Jaro-Winkler in ways person names do not. `Acme Global
 * Holdings` and `Global Holdings Acme` are the same company and score badly
 * character-by-character; `Acme Corp` and `Acmee Corp` differ by one typo inside
 * one token. So: split into tokens, pair each token with its best partner using
 * Jaro-Winkler, and score on how much of the larger name got paired.
 *
 * Legal-suffix stripping (`Inc`, `LLC`, `GmbH`) happens in
 * `lib/normalize/company.ts` before anything gets here. This module knows
 * nothing about companies — it compares bags of words.
 */

import { jaroWinkler } from "./jaro-winkler.ts";

/**
 * Below this, two tokens are different words rather than one misspelled word.
 * Deliberately strict: a loose token threshold is how `Acme Systems` and
 * `Apex Systems` end up looking like one company.
 */
const TOKEN_MATCH_THRESHOLD = 0.9;

export function tokenize(value: string): string[] {
  return value.split(/[\s]+/u).filter((token) => token.length > 0);
}

export type TokenSetResult = {
  /**
   * Paired weight over the *larger* token set. `Acme` against `Acme Global
   * Holdings` scores 0.33 — a subset is weak evidence of sameness, and treating
   * it as strong is how a parent company absorbs its subsidiary.
   */
  score: number;
  /**
   * Paired weight over the *smaller* token set: 1.0 when one name's tokens all
   * appear in the other. Reported separately so a caller can reason about
   * subsets explicitly instead of having that judgement baked into `score`.
   */
  containment: number;
  /** Which tokens paired with which, for the audit trail. */
  pairs: { a: string; b: string; similarity: number }[];
};

/**
 * Greedy best-match pairing between two token bags.
 *
 * Greedy rather than optimal (Hungarian) assignment: on the two-to-five token
 * strings company names actually are, the two agree almost always, and greedy is
 * readable. Iteration order is fixed by sorting the tokens first, so the result
 * cannot depend on the order the words arrived in — that would leak input order
 * into the output and break the project's order-independence invariant.
 */
export function tokenSetSimilarity(a: string, b: string): TokenSetResult {
  const aTokens = [...new Set(tokenize(a))].sort();
  const bTokens = [...new Set(tokenize(b))].sort();

  if (aTokens.length === 0 || bTokens.length === 0) {
    return { score: 0, containment: 0, pairs: [] };
  }

  const used = new Array<boolean>(bTokens.length).fill(false);
  const pairs: TokenSetResult["pairs"] = [];
  let paired = 0;

  for (const token of aTokens) {
    let bestIndex = -1;
    let bestSimilarity = 0;

    for (let j = 0; j < bTokens.length; j++) {
      if (used[j]) continue;
      const similarity = jaroWinkler(token, bTokens[j]);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestIndex = j;
      }
    }

    if (bestIndex === -1 || bestSimilarity < TOKEN_MATCH_THRESHOLD) continue;

    used[bestIndex] = true;
    paired += bestSimilarity;
    pairs.push({ a: token, b: bTokens[bestIndex], similarity: bestSimilarity });
  }

  return {
    score: paired / Math.max(aTokens.length, bTokens.length),
    containment: paired / Math.min(aTokens.length, bTokens.length),
    pairs,
  };
}
