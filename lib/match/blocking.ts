/**
 * Which pairs are worth comparing at all.
 *
 * Comparing every row against every other is `n(n-1)/2` — 11,175 comparisons for
 * 150 rows, and 5 billion for 100,000. Blocking cuts that by only comparing rows
 * that share at least one cheap key.
 *
 * The cost is recall: a true duplicate that shares no key is never compared, so
 * it can never be found, and no amount of clever scoring downstream recovers it.
 * That is why there are six keys rather than one — each is blind in a different
 * way, and the union covers what any single key would miss:
 *
 *   - a misspelled surname keeps its company and its phone
 *   - a missing phone keeps its mailbox
 *   - a personal mailbox with no company keeps its local part
 *   - the same name at two employers shares nothing but the name
 *
 * The honest version of the claim is a test, not a paragraph:
 * `blocking.test.ts` runs the exhaustive comparator over the bundled dataset and
 * asserts that blocking loses no pair the full sweep would have scored. The
 * pair-reduction ratio is reported in the metrics so the saving is visible next
 * to the risk.
 */

import type { CleanConfig, NormalizedRecord } from "../clean/types.ts";
import { identifiesPerson } from "../normalize/email.ts";
import { lastSevenDigits } from "../normalize/phone.ts";

/** Canonical pair orientation, so a pair has exactly one key everywhere. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Every key a record blocks on. Each is prefixed with its kind, so two different
 * kinds cannot collide on the same string.
 */
export function blockKeysFor(record: NormalizedRecord): string[] {
  const keys: string[] = [];
  const { name, email, phone, company, domain } = record;

  // 1. The canonical mailbox. The strongest key there is, and the cheapest.
  if (email.canonical !== undefined && identifiesPerson(email.kind)) {
    keys.push(`email:${email.canonical}`);

    // 2. The local part alone. Catches one person's address at two domains — the
    //    case that has to be *compared* in order to be refused.
    const local = email.canonical.split("@")[0];
    keys.push(`local:${local}`);
  }

  // 3. The subscriber part of the line, so a number written once with a country
  //    code and once without still lands in one bucket.
  const seven = lastSevenDigits(phone.e164);
  if (seven !== undefined) keys.push(`phone7:${seven}`);

  // 4. Surname sound plus employer: colleagues with a misspelled surname.
  if (name.lastKey !== undefined && company.key !== undefined) {
    keys.push(`sound-company:${name.lastKey}|${company.key}`);
  }

  // 5. Employer domain plus first initial and surname sound: works when the
  //    company *name* is written differently on the two rows.
  if (name.lastKey !== undefined && domain.value !== undefined) {
    keys.push(`domain-name:${domain.value}|${(name.first ?? "?")[0]}${name.lastKey}`);
  }

  // 6. Employer plus first initial: the key that survives a surname typo the
  //    phonetic key cannot bridge, like a dropped final consonant.
  if (company.key !== undefined && name.first !== undefined) {
    keys.push(`company-initial:${company.key}|${name.first[0]}`);
  }

  // 7. The whole name, employer-independent. The only key that can bring
  //    together the same person — or two namesakes — at different companies.
  if (name.last !== undefined) {
    keys.push(`name:${name.firstCanonical ?? name.first ?? "?"}|${name.last}`);
  }

  return keys;
}

export type Candidates = {
  /** Canonical, sorted, de-duplicated. */
  pairs: [string, string][];
  /** How many pairs will actually be scored. */
  comparisons: number;
  /** `n(n-1)/2` — what the exhaustive comparator would have cost. */
  exhaustive: number;
  /** Blocks too large to expand, reported rather than silently dropped. */
  skippedBlocks: { key: string; size: number }[];
};

/**
 * Candidate pairs, from blocking or from the exhaustive comparator.
 *
 * `config.blocking === false` compares everything. That mode is not a fallback
 * for production use — it is the baseline the blocking test measures against, and
 * having it in the same function means the two paths cannot drift apart.
 */
export function candidatePairs(records: NormalizedRecord[], config: CleanConfig): Candidates {
  const exhaustive = (records.length * (records.length - 1)) / 2;

  if (!config.blocking) {
    const pairs: [string, string][] = [];
    const ids = records.map((record) => record.id).sort();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i], ids[j]]);
    }
    return { pairs, comparisons: pairs.length, exhaustive, skippedBlocks: [] };
  }

  const blocks = new Map<string, string[]>();
  for (const record of records) {
    for (const key of blockKeysFor(record)) {
      const block = blocks.get(key);
      if (block) block.push(record.id);
      else blocks.set(key, [record.id]);
    }
  }

  const seen = new Set<string>();
  const pairs: [string, string][] = [];
  const skippedBlocks: { key: string; size: number }[] = [];

  // Sorted so the pair list is built in a fixed order regardless of how the
  // records arrived — the first of several places order independence is enforced
  // rather than hoped for.
  for (const key of [...blocks.keys()].sort()) {
    const members = [...new Set(blocks.get(key)!)].sort();
    if (members.length < 2) continue;

    // One enormous employer would otherwise make a single key quadratic on its
    // own, which defeats the point of blocking. Skipping is a recall loss and is
    // reported as one.
    if (members.length > config.maxBlockSize) {
      skippedBlocks.push({ key, size: members.length });
      continue;
    }

    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const id = pairKey(members[i], members[j]);
        if (seen.has(id)) continue;
        seen.add(id);
        pairs.push([members[i], members[j]]);
      }
    }
  }

  pairs.sort((left, right) => pairKey(...left).localeCompare(pairKey(...right)));
  return { pairs, comparisons: pairs.length, exhaustive, skippedBlocks };
}
