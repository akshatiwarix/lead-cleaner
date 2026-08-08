import type { Metrics } from "@/lib/clean/types";

/**
 * The numbers, including the unflattering ones.
 *
 * `comparisons` sits next to the others on purpose: blocking's saving and blocking's
 * recall risk are the same fact, and showing the ratio is how the claim stays honest.
 * The ground-truth column only appears for the bundled dataset, because only it has
 * labels — an uploaded file gets no scores, rather than invented ones.
 */
export function MetricsBar({ metrics }: { metrics: Metrics }) {
  const truth = metrics.groundTruth;

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-200 text-sm sm:grid-cols-3 lg:grid-cols-6 dark:bg-slate-800">
      <Cell label="rows in" value={metrics.rowsIn} />
      <Cell
        label="people out"
        value={metrics.clusters}
        note={`${(metrics.dedupRate * 100).toFixed(1)}% removed as duplicates`}
      />
      <Cell label="merged clusters" value={metrics.merged} note={`${metrics.autoMerged} pairs joined`} />
      <Cell label="to review" value={metrics.pendingReview} note={`${metrics.refused} pairs refused`} />
      <Cell
        label="conflicts"
        value={metrics.conflicts}
        note={`${metrics.quarantined} rows quarantined`}
      />
      <Cell
        label="comparisons"
        value={metrics.comparisons}
        note={`${(metrics.comparisonRatio * 100).toFixed(2)}% of all-pairs`}
      />

      {truth !== undefined && (
        <>
          <Cell
            label="auto precision"
            value={truth.autoPrecision.toFixed(3)}
            note="false merges are unrecoverable, so this one has to be 1"
            wide
          />
          <Cell
            label="auto recall"
            value={truth.autoRecall.toFixed(3)}
            note={`of ${truth.truePairs} true pairs`}
            wide
          />
          <Cell
            label="if the queue were accepted blindly"
            value={`${truth.withReviewPrecision.toFixed(3)} / ${truth.withReviewRecall.toFixed(3)}`}
            note="precision / recall — the gap is the work the queue is asking for"
            wide
          />
        </>
      )}
    </div>
  );
}

function Cell({
  label,
  value,
  note,
  wide,
}: {
  label: string;
  value: string | number;
  note?: string;
  wide?: boolean;
}) {
  return (
    <div className={`bg-white p-3 dark:bg-slate-950 ${wide ? "sm:col-span-1 lg:col-span-2" : ""}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div key={String(value)} className="bumped text-xl font-semibold tabular-nums">
        {value}
      </div>
      {note !== undefined && <div className="mt-0.5 text-[11px] text-slate-500">{note}</div>}
    </div>
  );
}
