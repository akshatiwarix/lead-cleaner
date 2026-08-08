/**
 * Which value survives a merge, and why.
 *
 * A merge is two decisions, not one. The first — are these the same person? — is
 * `lib/match`'s. The second is this one, and it is the decision that quietly loses
 * data: three rows disagree about someone's title, one value goes into the export,
 * and the other two are gone. Nobody notices for a year.
 *
 * So the chain is explicit, ordered, and reported. Rungs are asked in turn and the
 * first one that discriminates wins:
 *
 *   1. **non-empty beats empty** — a newer row that dropped a column must not
 *      erase the column
 *   2. **valid beats invalid** — a parsed E.164 over digits that would not parse,
 *      a personal mailbox over a shared inbox
 *   3. **source trust** — a CRM export over a purchased list, in the order the
 *      caller configured
 *   4. **recency** — the more recent of two equally trusted rows
 *   5. **lowest id** — a deterministic tiebreak, so there is always an answer and
 *      it never depends on row order
 *
 * Recency sits *below* trust deliberately. "Newest wins" is the common default and
 * it is wrong for lead data, where the newest touch is often the least reliable
 * one: a form fill or a bought list arrives after the CRM record and overwrites it.
 *
 * Every losing value that disagreed is kept in `conflicts`. Resolving a conflict
 * silently is the same as deleting the loser.
 */

import type { Provenance } from "../clean/types.ts";

export type Candidate = {
  id: string;
  value?: string;
  /** False when the field parsed but is not usable as itself — a role address, an unparseable number. */
  valid?: boolean;
  source?: string;
  /** ISO `YYYY-MM-DD`; absent when the row's date could not be read unambiguously. */
  updatedAt?: string;
};

/** Unknown sources rank after every configured one, in a stable order. */
function trustRank(source: string | undefined, sourceTrust: string[]): number {
  if (source === undefined) return sourceTrust.length + 1;
  const rank = sourceTrust.indexOf(source);
  return rank === -1 ? sourceTrust.length : rank;
}

/**
 * The winning value for one field, with the rung that decided it and every
 * disagreeing value that lost.
 *
 * Returns undefined only when no candidate has a value at all — an absent field
 * stays absent rather than becoming an empty string.
 */
export function pickWinner(candidates: Candidate[], sourceTrust: string[]): Provenance | undefined {
  const present = candidates.filter(
    (candidate) => candidate.value !== undefined && candidate.value.length > 0,
  );
  if (present.length === 0) return undefined;

  const ranked = [...present].sort((left, right) => {
    // Rung 2. `valid !== false` so a field with no validity notion never loses to
    // one that has an explicit true.
    const leftValid = left.valid !== false ? 0 : 1;
    const rightValid = right.valid !== false ? 0 : 1;
    if (leftValid !== rightValid) return leftValid - rightValid;

    // Rung 3.
    const trust = trustRank(left.source, sourceTrust) - trustRank(right.source, sourceTrust);
    if (trust !== 0) return trust;

    // Rung 4. ISO dates compare correctly as strings; a missing date sorts last.
    const leftDate = left.updatedAt ?? "";
    const rightDate = right.updatedAt ?? "";
    if (leftDate !== rightDate) return rightDate.localeCompare(leftDate);

    // Rung 5.
    return left.id.localeCompare(right.id);
  });

  const winner = ranked[0];
  const rule = explain(winner, ranked, sourceTrust);

  // Deduplicated by value: three rows agreeing on a losing value is one conflict,
  // not three. Sorted by id so the list cannot depend on input order.
  const seen = new Set<string>([winner.value!]);
  const conflicts: { id: string; value: string }[] = [];
  for (const candidate of [...ranked].sort((left, right) => left.id.localeCompare(right.id))) {
    if (seen.has(candidate.value!)) continue;
    seen.add(candidate.value!);
    conflicts.push({ id: candidate.id, value: candidate.value! });
  }

  return { winnerId: winner.id, value: winner.value!, rule, conflicts };
}

/** Names the rung that actually decided it, rather than the first one checked. */
function explain(winner: Candidate, ranked: Candidate[], sourceTrust: string[]): string {
  if (ranked.length === 1) return "only row with a value for this field";

  const rivals = ranked.slice(1);
  if (rivals.some((rival) => rival.valid === false) && winner.valid !== false) {
    return "the only usable value; the others did not parse as this kind of field";
  }
  const winnerTrust = trustRank(winner.source, sourceTrust);
  if (rivals.some((rival) => trustRank(rival.source, sourceTrust) > winnerTrust)) {
    return `most trusted source (${winner.source ?? "unlabelled"})`;
  }
  if (rivals.some((rival) => (rival.updatedAt ?? "") < (winner.updatedAt ?? ""))) {
    return `most recent of equally trusted rows (${winner.updatedAt})`;
  }
  return "tie broken on the lowest row id, so the result is stable";
}
