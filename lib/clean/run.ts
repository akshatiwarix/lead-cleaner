/**
 * The one entry point. Everything calls this: the API route, the browser, the sweep
 * script, and every test.
 *
 * There is deliberately no second orchestration path. A "quick" variant that skipped
 * a stage would drift from this one, and then two answers would exist for the same
 * question.
 *
 * ```
 * parse → normalize → triage → block → refuse → score → constrain → cluster → survive → metrics
 * ```
 *
 * Pure: no clock, no network, no environment, no random source. That is what lets the
 * whole pipeline run in the browser, which is what lets an uploaded CSV stay on the
 * machine it came from. `purity.test.ts` enforces it by reading the source.
 */

import type { CleanConfig, CleanResult, Constraint, InputRow, NormalizedRecord, Quarantined } from "./types.ts";
import { contentHash } from "./hash.ts";
import { computeMetrics } from "./metrics.ts";
import { matchRecords } from "../match/index.ts";
import { normalizeRows } from "../normalize/index.ts";
import { identifiesPerson } from "../normalize/email.ts";
import { canonicalise } from "../survive/canonical.ts";

/**
 * Why a row cannot be matched, or undefined if it can.
 *
 * A row needs *something* that could identify a person. Without one, comparing it
 * against anything is guesswork, and a guess here creates a cluster rather than
 * failing loudly.
 *
 * Quarantined rows are reported and still reach the export marked as such. Dropping
 * them would be the single worst thing this category of tool does: a file goes in
 * with 150 rows, a file comes out with 141, and nobody can say which nine went
 * missing.
 */
export function quarantineReason(record: NormalizedRecord): string | undefined {
  const hasMailbox = record.email.canonical !== undefined && identifiesPerson(record.email.kind);
  const hasPhone = record.phone.valid;
  const hasNameAndCompany = record.name.last !== undefined && record.company.key !== undefined;

  if (hasMailbox || hasPhone || hasNameAndCompany) return undefined;

  const held: string[] = [];
  if (record.email.kind === "role") held.push("only a shared inbox, which is not a person");
  if (record.email.kind === "invalid") held.push("an address that could not be read");
  if (record.name.last !== undefined) held.push("a name with no company to place it against");
  if (record.company.key !== undefined) held.push("a company with no name to attach to it");
  if (record.title.tidied !== undefined) held.push("a job title and nothing else");

  return held.length > 0
    ? `no way to identify a person: ${held.join("; ")}`
    : "no way to identify a person: no mailbox, no phone, and no name with a company";
}

export function clean(
  rows: InputRow[],
  config: CleanConfig,
  constraints: Constraint[] = [],
): CleanResult {
  const normalized = normalizeRows(rows, config);

  const quarantined: Quarantined[] = [];
  const matchable: NormalizedRecord[] = [];
  for (const record of normalized) {
    const reason = quarantineReason(record);
    if (reason === undefined) matchable.push(record);
    else quarantined.push({ id: record.id, reason });
  }

  const byId = new Map(matchable.map((record) => [record.id, record]));
  const matched = matchRecords(matchable, config, constraints);

  const clusters = matched.clusters.map((cluster) => canonicalise(cluster, byId, config.sourceTrust));

  return {
    // Identifies the run by its inputs. Row ids rather than row contents, because
    // this answers "was this the same run?", not "was this the same data?" — and the
    // ids are what the constraint set refers to.
    runHash: contentHash({
      config,
      constraints: [...constraints]
        .map((constraint) => ({ ...constraint }))
        .sort((left, right) => `${left.a}|${left.b}`.localeCompare(`${right.a}|${right.b}`)),
      ids: rows.map((row) => row.id).sort(),
    }),
    config,
    clusters,
    review: matched.review,
    refused: matched.refused,
    quarantined: quarantined.sort((left, right) => left.id.localeCompare(right.id)),
    metrics: computeMetrics({
      rows,
      clusters,
      review: matched.review,
      refused: matched.refused,
      quarantined,
      comparisons: matched.comparisons,
      exhaustive: matched.exhaustive,
      skippedBlocks: matched.skippedBlocks,
    }),
  };
}
