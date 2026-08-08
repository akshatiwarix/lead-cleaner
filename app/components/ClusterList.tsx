"use client";

import { useState } from "react";
import type { Cluster, FieldName, InputRow } from "@/lib/clean/types";
import { Chip, Empty, Mono, Verdict } from "./chips";

const FIELDS: FieldName[] = ["fullName", "email", "phone", "company", "domain", "title"];
const LABELS: Record<FieldName, string> = {
  fullName: "name",
  email: "email",
  phone: "phone",
  company: "company",
  domain: "domain",
  title: "title",
};

/**
 * The merges, and underneath each one the evidence that produced it.
 *
 * Expanding a cluster is the answer to the question this project exists to answer:
 * *why did you merge those two?* Three things are shown, in the order someone would
 * ask for them — the edges that joined the rows, the rule that decided each surviving
 * field, and the values that lost. The last one matters most: a conflict shown is a
 * conflict a human can overrule, and a conflict hidden is data quietly deleted.
 */
export function ClusterList({
  clusters,
  rows,
  onSplit,
}: {
  clusters: Cluster[];
  rows: Map<string, InputRow>;
  onSplit: (a: string, b: string) => void;
}) {
  const [open, setOpen] = useState<string | undefined>(
    clusters.find((cluster) => cluster.memberIds.length > 1)?.id,
  );
  const [mergedOnly, setMergedOnly] = useState(true);

  const shown = mergedOnly ? clusters.filter((cluster) => cluster.memberIds.length > 1) : clusters;

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
        <input
          type="checkbox"
          checked={mergedOnly}
          onChange={(event) => setMergedOnly(event.target.checked)}
          className="size-4"
        />
        show only clusters that merged something ({clusters.filter((c) => c.memberIds.length > 1).length} of{" "}
        {clusters.length})
      </label>

      {shown.length === 0 && <Empty>Nothing merged at this configuration.</Empty>}

      <ul className="flex flex-col gap-2">
        {shown.map((cluster) => {
          const expanded = open === cluster.id;
          return (
            <li
              key={cluster.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
            >
              <button
                type="button"
                onClick={() => setOpen(expanded ? undefined : cluster.id)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                <span className="text-sm font-medium">{cluster.canonical.fullName ?? "(no name)"}</span>
                <Mono>{cluster.canonical.email ?? "—"}</Mono>
                <span className="text-xs text-slate-500">{cluster.canonical.company ?? "—"}</span>
                <span className="ml-auto flex items-center gap-2">
                  {cluster.memberIds.length > 1 && (
                    <Chip tone="merged">{cluster.memberIds.length} rows</Chip>
                  )}
                  {cluster.conflictCount > 0 && (
                    <Chip tone="review">
                      {cluster.conflictCount} conflict{cluster.conflictCount === 1 ? "" : "s"}
                    </Chip>
                  )}
                  <Chip>{cluster.strength}</Chip>
                  <span className="font-mono text-[11px] text-slate-400">{expanded ? "−" : "+"}</span>
                </span>
              </button>

              {expanded && (
                <div className="border-t border-slate-200 dark:border-slate-800">
                  <Section title="Why these rows are one person">
                    {cluster.edges.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        A single row. Nothing was merged, so there is nothing to justify.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {cluster.edges.map((edge) => (
                          <li
                            key={`${edge.a}|${edge.b}`}
                            className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900"
                          >
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <Mono>
                                {edge.a} ↔ {edge.b}
                              </Mono>
                              <Chip tone={edge.kind === "authoritative" ? "merged" : "review"}>
                                {edge.kind}
                              </Chip>
                              <span className="text-slate-500">score {edge.score.toFixed(2)}</span>
                              <button
                                type="button"
                                onClick={() => onSplit(edge.a, edge.b)}
                                className="ml-auto rounded-md border border-rose-300 px-2 py-0.5 text-[11px] text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950"
                              >
                                not the same person
                              </button>
                            </div>
                            <ul className="mt-1.5 flex flex-col gap-1">
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
                    )}
                  </Section>

                  <Section title="Which value survived, and why">
                    <table className="w-full text-left text-xs">
                      <thead className="text-slate-500">
                        <tr>
                          <th className="py-1 pr-3 font-normal">field</th>
                          <th className="py-1 pr-3 font-normal">kept</th>
                          <th className="py-1 pr-3 font-normal">from</th>
                          <th className="py-1 pr-3 font-normal">rule</th>
                          <th className="py-1 font-normal">overruled</th>
                        </tr>
                      </thead>
                      <tbody>
                        {FIELDS.map((field) => {
                          const provenance = cluster.provenance[field];
                          if (provenance === undefined) return null;
                          return (
                            <tr
                              key={field}
                              className="border-t border-slate-100 align-top dark:border-slate-900"
                            >
                              <td className="py-1.5 pr-3 text-slate-500">{LABELS[field]}</td>
                              <td className="py-1.5 pr-3 font-medium">{provenance.value}</td>
                              <td className="py-1.5 pr-3">
                                <Mono>{provenance.winnerId}</Mono>
                              </td>
                              <td className="py-1.5 pr-3 text-slate-500">{provenance.rule}</td>
                              <td className="py-1.5">
                                {provenance.conflicts.length === 0 ? (
                                  <span className="text-slate-400">—</span>
                                ) : (
                                  <ul className="flex flex-col gap-0.5">
                                    {provenance.conflicts.map((conflict) => (
                                      <li key={conflict.id} className="text-amber-700 dark:text-amber-400">
                                        {conflict.value} <Mono>({conflict.id})</Mono>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </Section>

                  <Section title="The rows as they arrived">
                    <ul className="flex flex-col gap-1 text-xs">
                      {cluster.memberIds.map((id) => {
                        const row = rows.get(id);
                        return (
                          <li key={id} className="flex flex-wrap items-baseline gap-2">
                            <Mono>{id}</Mono>
                            <span>{row?.mapped.fullName ?? [row?.mapped.firstName, row?.mapped.lastName].filter(Boolean).join(" ") ?? "—"}</span>
                            <Mono>{row?.mapped.email ?? "—"}</Mono>
                            <Mono>{row?.mapped.phone ?? "—"}</Mono>
                            <span className="text-slate-500">{row?.mapped.company ?? "—"}</span>
                            {row?.mapped.source !== undefined && <Chip>{row.mapped.source}</Chip>}
                            {row?.mapped.updatedAt !== undefined && (
                              <span className="text-slate-400">{row.mapped.updatedAt}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </Section>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 p-3 last:border-b-0 dark:border-slate-900">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </div>
  );
}
