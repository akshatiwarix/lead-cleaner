/**
 * The numbers, including the ones that are unflattering.
 *
 * Two sets. The counts describe the run: rows in, people out, what merged, what is
 * waiting, what was refused, how many comparisons it took. Those hold for any input.
 *
 * The ground-truth block only appears when the rows carry `truePersonId`, and it is
 * the one that makes the project's central claim checkable. Precision and recall are
 * measured over *pairs* rather than clusters, because that is the unit of damage: a
 * cluster that wrongly absorbs one row is one bad pair against a handful of good
 * ones, and a cluster-level score would hide it.
 *
 * `auto` is what the engine did by itself. `withReview` is what you would get if a
 * reviewer accepted the entire queue without thinking — the ceiling on recall and
 * the floor on precision. Publishing both is the point: the gap between them is
 * exactly the work the review queue is asking a human to do.
 */

import type { CleanResult, Cluster, Edge, InputRow, Metrics, Quarantined } from "./types.ts";
import { pairKey } from "../match/blocking.ts";

function withinClusterPairs(clusters: Cluster[]): string[] {
  const pairs: string[] = [];
  for (const cluster of clusters) {
    for (let i = 0; i < cluster.memberIds.length; i++) {
      for (let j = i + 1; j < cluster.memberIds.length; j++) {
        pairs.push(pairKey(cluster.memberIds[i], cluster.memberIds[j]));
      }
    }
  }
  return pairs;
}

function truePairsFrom(rows: InputRow[]): Set<string> {
  const byPerson = new Map<string, string[]>();
  for (const row of rows) {
    if (row.truePersonId === undefined) continue;
    byPerson.set(row.truePersonId, [...(byPerson.get(row.truePersonId) ?? []), row.id]);
  }

  const pairs = new Set<string>();
  for (const ids of byPerson.values()) {
    const sorted = [...ids].sort();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) pairs.add(pairKey(sorted[i], sorted[j]));
    }
  }
  return pairs;
}

function score(predicted: string[], truth: Set<string>): { precision: number; recall: number } {
  const unique = [...new Set(predicted)];
  const hits = unique.filter((pair) => truth.has(pair)).length;
  return {
    // No predictions is precision 1, not 0 — a tool that merges nothing has not
    // made a mistake. It has a recall problem, which the other number reports.
    precision: unique.length === 0 ? 1 : hits / unique.length,
    recall: truth.size === 0 ? 1 : hits / truth.size,
  };
}

export function computeMetrics(input: {
  rows: InputRow[];
  clusters: Cluster[];
  review: Edge[];
  refused: Edge[];
  quarantined: Quarantined[];
  comparisons: number;
  exhaustive: number;
  skippedBlocks: { key: string; size: number }[];
}): Metrics {
  const { rows, clusters, review, refused, quarantined, comparisons, exhaustive, skippedBlocks } = input;

  const clustered = clusters.reduce((sum, cluster) => sum + cluster.memberIds.length, 0);
  const merged = clusters.filter((cluster) => cluster.memberIds.length > 1).length;
  const autoPairs = withinClusterPairs(clusters);

  const metrics: Metrics = {
    rowsIn: rows.length,
    quarantined: quarantined.length,
    clusters: clusters.length,
    merged,
    // Rows removed as duplicates, over rows eligible to be deduplicated. Quarantined
    // rows are excluded from both halves: they never entered matching, so counting
    // them would flatter the rate.
    dedupRate: clustered === 0 ? 0 : (clustered - clusters.length) / clustered,
    autoMerged: autoPairs.length,
    pendingReview: review.length,
    refused: refused.length,
    conflicts: clusters.reduce((sum, cluster) => sum + cluster.conflictCount, 0),
    comparisons,
    comparisonRatio: exhaustive === 0 ? 1 : comparisons / exhaustive,
    skippedBlocks,
  };

  const truth = truePairsFrom(rows);
  if (truth.size > 0) {
    const auto = score(autoPairs, truth);
    const withReview = score([...autoPairs, ...review.map((edge) => pairKey(edge.a, edge.b))], truth);
    metrics.groundTruth = {
      autoPrecision: auto.precision,
      autoRecall: auto.recall,
      withReviewPrecision: withReview.precision,
      withReviewRecall: withReview.recall,
      truePairs: truth.size,
    };
  }

  return metrics;
}

/** The one-line summary the UI and the sweep both print. */
export function summarise(result: CleanResult): string {
  const { metrics } = result;
  return [
    `${metrics.rowsIn} rows`,
    `${metrics.clusters} people`,
    `${(metrics.dedupRate * 100).toFixed(1)}% duplicates removed`,
    `${metrics.pendingReview} to review`,
    `${metrics.quarantined} quarantined`,
    `${metrics.comparisons} comparisons (${(metrics.comparisonRatio * 100).toFixed(2)}% of exhaustive)`,
  ].join(" · ");
}
