"use client";

import type { Edge, InputRow } from "@/lib/clean/types";
import { Chip, Empty, Mono, Verdict } from "./chips";

/**
 * The queue, and the two buttons that make it worth having.
 *
 * Every decision here becomes a constraint — an *input* to the engine, not state this
 * component keeps. That is what makes the run reproducible by someone else: the
 * constraint set travels in `audit.json`, and replaying it produces the same clusters.
 *
 * Both buttons matter. Accepting a pair is the obvious one; rejecting it records a
 * must-not-link that outranks every rule in the system, including the automatic ones,
 * and survives re-clustering.
 */
export function ReviewQueue({
  review,
  rows,
  onDecide,
}: {
  review: Edge[];
  rows: Map<string, InputRow>;
  onDecide: (a: string, b: string, kind: "link" | "must-not-link") => void;
}) {
  if (review.length === 0) {
    return (
      <Empty>
        Nothing pending. Every pair at this threshold either merged automatically, was refused, or
        scored too low to be worth asking about.
      </Empty>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {review.map((edge) => (
        <li
          key={`${edge.a}|${edge.b}`}
          className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="review">score {edge.score.toFixed(2)}</Chip>
            <span className="text-xs text-slate-500">
              probable — never merged without a decision
            </span>
            <span className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => onDecide(edge.a, edge.b, "link")}
                className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
              >
                same person
              </button>
              <button
                type="button"
                onClick={() => onDecide(edge.a, edge.b, "must-not-link")}
                className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
              >
                different people
              </button>
            </span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Side id={edge.a} row={rows.get(edge.a)} />
            <Side id={edge.b} row={rows.get(edge.b)} />
          </div>

          <ul className="mt-3 flex flex-col gap-1 border-t border-slate-100 pt-2 dark:border-slate-900">
            {edge.reasons.map((reason, index) => (
              <li key={index} className="flex flex-wrap items-baseline gap-2 text-xs">
                <Verdict verdict={reason.verdict} />
                <span className="font-medium">{reason.rule}</span>
                <span className="text-slate-500">{reason.detail}</span>
                {reason.weight !== undefined && (
                  <Mono>
                    {reason.weight >= 0 ? "+" : ""}
                    {reason.weight.toFixed(3)}
                  </Mono>
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function Side({ id, row }: { id: string; row?: InputRow }) {
  const name =
    row?.mapped.fullName ?? [row?.mapped.firstName, row?.mapped.lastName].filter(Boolean).join(" ");

  return (
    <div className="rounded-lg bg-slate-50 p-2.5 text-xs dark:bg-slate-900">
      <div className="flex items-baseline gap-2">
        <Mono>{id}</Mono>
        <span className="font-medium">{name || "(no name)"}</span>
      </div>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        <Field label="email" value={row?.mapped.email} />
        <Field label="phone" value={row?.mapped.phone} />
        <Field label="company" value={row?.mapped.company} />
        <Field label="title" value={row?.mapped.title} />
        <Field label="source" value={row?.mapped.source} />
        <Field label="updated" value={row?.mapped.updatedAt} />
      </dl>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="truncate font-mono">{value ?? "—"}</dd>
    </>
  );
}
