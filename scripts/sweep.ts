/**
 * The threshold sweep. Run with `npm run sweep`.
 *
 * A threshold picked by eye is indefensible, and "0.75 felt right" is not a claim
 * anyone should accept. This prints what each value actually costs, measured against
 * the dataset's `truePersonId` labels, and the table it emits is what the README
 * publishes.
 *
 * Two columns matter most and they are the whole argument:
 *
 *   `auto P` is precision if nobody reviews anything. It is 1.000 at every
 *   threshold, and that is not luck — the automatic tier does not consult the
 *   threshold at all. It merges on a shared mailbox or a shared line, never on a
 *   score, so moving the slider cannot introduce a false merge.
 *
 *   `blind P` is precision if a reviewer accepts the entire queue without looking.
 *   It falls as the threshold drops. The gap between the two is the review queue's
 *   reason for existing, expressed as a number.
 */

import { clean } from "../lib/clean/run.ts";
import { DEFAULT_CONFIG } from "../lib/clean/config.ts";
import { demoRows } from "../data/leads.ts";

const rows = demoRows();
const thresholds = [0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5];

const pad = (value: string, width: number) => value.padStart(width);
const row = (cells: string[], widths: number[]) =>
  cells.map((cell, index) => pad(cell, widths[index])).join("  ");

const widths = [9, 8, 7, 8, 7, 8, 8, 8];
const header = ["threshold", "people", "queue", "auto P", "auto R", "blind P", "blind R", "refused"];

console.log("\nThreshold sweep over the bundled dataset\n");
console.log(row(header, widths));
console.log(widths.map((width) => "-".repeat(width)).join("  "));

for (const reviewThreshold of thresholds) {
  const result = clean(rows, { ...DEFAULT_CONFIG, reviewThreshold });
  const truth = result.metrics.groundTruth!;

  console.log(
    row(
      [
        reviewThreshold.toFixed(2),
        String(result.metrics.clusters),
        String(result.metrics.pendingReview),
        truth.autoPrecision.toFixed(3),
        truth.autoRecall.toFixed(3),
        truth.withReviewPrecision.toFixed(3),
        truth.withReviewRecall.toFixed(3),
        String(result.metrics.refused),
      ],
      widths,
    ),
  );
}

const base = clean(rows, DEFAULT_CONFIG);
const exhaustive = clean(rows, { ...DEFAULT_CONFIG, blocking: false });

console.log(`
Fixed across every threshold, because the automatic tier never reads it:
  true pairs in the dataset      ${base.metrics.groundTruth!.truePairs}
  pairs merged automatically     ${base.metrics.autoMerged}
  rows quarantined               ${base.metrics.quarantined}
  fields with a flagged conflict ${base.metrics.conflicts}

Blocking, at the shipped defaults:
  comparisons with blocking      ${base.metrics.comparisons}
  comparisons exhaustive         ${exhaustive.metrics.comparisons}
  reduction                      ${(exhaustive.metrics.comparisons / base.metrics.comparisons).toFixed(1)}x (${(base.metrics.comparisonRatio * 100).toFixed(2)}% of all pairs)
  same clusters either way       ${JSON.stringify(base.clusters) === JSON.stringify(exhaustive.clusters)}
`);
