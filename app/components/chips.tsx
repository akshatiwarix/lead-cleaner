/**
 * The small shared pieces. Kept in one file because each is three lines and the
 * point of them is that a verdict looks the same everywhere it appears.
 */

const TONES = {
  merged: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  review: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  refused: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900",
  held: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-900",
  quiet: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800",
} as const;

export type Tone = keyof typeof TONES;

export function Chip({ tone = "quiet", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** A verdict on one piece of evidence: matched, disagreed, or refuted the pair. */
export function Verdict({ verdict }: { verdict: "match" | "mismatch" | "refuse" }) {
  const label = verdict === "match" ? "agrees" : verdict === "mismatch" ? "differs" : "refuses";
  const tone: Tone = verdict === "match" ? "merged" : verdict === "refuse" ? "refused" : "quiet";
  return <Chip tone={tone}>{label}</Chip>;
}

export function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[13px]">{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
      {children}
    </p>
  );
}
