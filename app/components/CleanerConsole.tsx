"use client";

import { useMemo, useState } from "react";
import type { CleanConfig, Constraint, InputRow } from "@/lib/clean/types";
import { clean } from "@/lib/clean/run";
import { auditJson, cleanedCsv, reviewCsv } from "@/lib/export/index";
import { parseLeadFile } from "@/lib/csv/mapping";
import { pairKey } from "@/lib/match/blocking";
import { ClusterList } from "./ClusterList";
import { ConfigPanel } from "./ConfigPanel";
import { MetricsBar } from "./MetricsBar";
import { ReviewQueue } from "./ReviewQueue";
import { Chip, Empty, Mono } from "./chips";

type Tab = "clusters" | "review" | "refused" | "quarantine";

/**
 * The whole app, client-side.
 *
 * The engine is pure, so it runs here rather than on a server, and that is the answer
 * to the obvious objection about pasting a customer list into a stranger's tool: an
 * uploaded file is parsed and cleaned in this component and never leaves the machine.
 * `POST /api/clean` exists for scripting and calls the same function.
 *
 * Re-running on every change is affordable because the pipeline is fast — 150 rows in
 * a few milliseconds — and it means dragging the threshold moves the numbers live,
 * which is the only way the precision/recall tradeoff becomes something you can feel
 * rather than read.
 */
export function CleanerConsole({
  demo,
  defaultConfig,
}: {
  demo: InputRow[];
  defaultConfig: CleanConfig;
}) {
  const [config, setConfig] = useState(defaultConfig);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [rows, setRows] = useState(demo);
  const [uploaded, setUploaded] = useState<{ name: string; unmapped: string[] } | undefined>();
  const [tab, setTab] = useState<Tab>("clusters");
  const [error, setError] = useState<string | undefined>();

  const result = useMemo(() => clean(rows, config, constraints), [rows, config, constraints]);
  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  function decide(a: string, b: string, kind: Constraint["kind"]) {
    setConstraints((current) => [
      ...current.filter((constraint) => pairKey(constraint.a, constraint.b) !== pairKey(a, b)),
      { kind, a, b, by: "human" },
    ]);
  }

  async function onUpload(file: File) {
    setError(undefined);
    const text = await file.text();
    const parsed = parseLeadFile(text);

    if (parsed.rows.length === 0) {
      setError("No data rows found. The first line has to be a header.");
      return;
    }
    const mapped = Object.keys(parsed.mapping);
    if (mapped.length === 0) {
      setError(
        `None of the columns were recognisable: ${parsed.headers.join(", ")}. Expected something like name, email, phone or company.`,
      );
      return;
    }

    setRows(parsed.rows);
    setConstraints([]);
    setUploaded({ name: file.name, unmapped: parsed.unmapped });
    setTab("clusters");
  }

  function download(filename: string, contents: string, type: string) {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "clusters", label: "Clusters", count: result.metrics.merged },
    { id: "review", label: "Review", count: result.review.length },
    { id: "refused", label: "Refused", count: result.refused.length },
    { id: "quarantine", label: "Quarantine", count: result.quarantined.length },
  ];

  return (
    <div className="flex flex-col gap-4">
      <MetricsBar metrics={result.metrics} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="order-2 flex min-w-0 flex-col gap-3 lg:order-1">
          <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
            {tabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                  tab === entry.id
                    ? "border-sky-600 font-medium text-sky-700 dark:text-sky-400"
                    : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              >
                {entry.label}{" "}
                <span className="font-mono text-xs tabular-nums text-slate-400">{entry.count}</span>
              </button>
            ))}
          </nav>

          {tab === "clusters" && (
            <ClusterList
              clusters={result.clusters}
              rows={byId}
              onSplit={(a, b) => decide(a, b, "must-not-link")}
            />
          )}

          {tab === "review" && (
            <ReviewQueue review={result.review} rows={byId} onDecide={decide} />
          )}

          {tab === "refused" && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-slate-500">
                Pairs that cannot be one person, whatever else agrees. Refusals are evaluated before
                scoring and win outright — a false merge is unrecoverable, so evidence against a
                pair outranks evidence for it.
              </p>
              {result.refused.length === 0 && <Empty>Nothing refused.</Empty>}
              <ul className="flex flex-col gap-1.5">
                {result.refused.map((edge) => (
                  <li
                    key={`${edge.a}|${edge.b}`}
                    className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-800 dark:bg-slate-950"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Mono>
                        {edge.a} ↮ {edge.b}
                      </Mono>
                      <Chip tone="refused">{edge.reasons.at(-1)?.rule}</Chip>
                    </div>
                    <p className="mt-1 text-slate-500">{edge.reasons.at(-1)?.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === "quarantine" && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-slate-500">
                Rows with nothing that could identify a person. They never enter matching, and they
                still appear in <Mono>cleaned.csv</Mono> marked as held — silently dropping rows is
                the worst thing a tool like this can do, because the loss is invisible.
              </p>
              {result.quarantined.length === 0 && <Empty>Nothing quarantined.</Empty>}
              <ul className="flex flex-col gap-1.5">
                {result.quarantined.map((held) => {
                  const row = byId.get(held.id);
                  return (
                    <li
                      key={held.id}
                      className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-800 dark:bg-slate-950"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Mono>{held.id}</Mono>
                        <span className="text-slate-500">
                          {[row?.mapped.fullName, row?.mapped.email, row?.mapped.company]
                            .filter(Boolean)
                            .join(" · ") || "(empty row)"}
                        </span>
                      </div>
                      <p className="mt-1 text-violet-700 dark:text-violet-300">{held.reason}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <aside className="order-1 flex flex-col gap-4 lg:order-2">
          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <h2 className="text-sm font-semibold">Your own file</h2>
            <p className="mt-1 text-xs text-slate-500">
              Parsed and cleaned in this tab. Nothing is uploaded anywhere — the engine does no I/O,
              which is why it can run here at all.
            </p>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file !== undefined) void onUpload(file);
              }}
              className="mt-2 w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:text-white dark:file:bg-slate-100 dark:file:text-slate-900"
            />
            {error !== undefined && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
            {uploaded !== undefined && (
              <div className="mt-2 flex flex-col gap-1 text-xs">
                <span className="text-slate-600 dark:text-slate-400">
                  {uploaded.name} — {rows.length} rows
                </span>
                {uploaded.unmapped.length > 0 && (
                  <span className="text-slate-500">
                    kept but unmapped: {uploaded.unmapped.join(", ")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setRows(demo);
                    setConstraints([]);
                    setUploaded(undefined);
                  }}
                  className="self-start underline underline-offset-2"
                >
                  back to the demo dataset
                </button>
              </div>
            )}
          </section>

          <ConfigPanel
            config={config}
            onChange={setConfig}
            onReset={() => setConfig(defaultConfig)}
          />

          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <h2 className="text-sm font-semibold">Decisions</h2>
            <p className="mt-1 text-xs text-slate-500">
              Review decisions are an input to the engine, not state this page keeps. They travel in{" "}
              <Mono>audit.json</Mono>, so someone else can replay this exact run.
            </p>
            <p className="mt-2 text-xs">
              <Mono>{constraints.length}</Mono> recorded · run{" "}
              <Mono>{result.runHash}</Mono>
            </p>
            {constraints.length > 0 && (
              <>
                <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto text-xs">
                  {constraints.map((constraint) => (
                    <li key={pairKey(constraint.a, constraint.b)} className="flex items-center gap-2">
                      <Chip tone={constraint.kind === "link" ? "merged" : "refused"}>
                        {constraint.kind}
                      </Chip>
                      <Mono>
                        {constraint.a} / {constraint.b}
                      </Mono>
                      <button
                        type="button"
                        onClick={() =>
                          setConstraints((current) =>
                            current.filter(
                              (item) => pairKey(item.a, item.b) !== pairKey(constraint.a, constraint.b),
                            ),
                          )
                        }
                        className="ml-auto text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                        aria-label="undo this decision"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setConstraints([])}
                  className="mt-2 text-xs text-slate-500 underline underline-offset-2"
                >
                  clear all decisions
                </button>
              </>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <h2 className="text-sm font-semibold">Export</h2>
            <div className="mt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => download("cleaned.csv", cleanedCsv(result, rows), "text/csv")}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
              >
                cleaned.csv — one row per person, held rows marked
              </button>
              <button
                type="button"
                onClick={() => download("review.csv", reviewCsv(result, rows), "text/csv")}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
              >
                review.csv — the pending pairs, to work offline
              </button>
              <button
                type="button"
                onClick={() => download("audit.json", auditJson(result, constraints), "application/json")}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
              >
                audit.json — everything needed to reproduce this run
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
