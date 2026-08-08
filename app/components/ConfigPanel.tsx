"use client";

import type { CleanConfig } from "@/lib/clean/types";

/**
 * The knobs, with the consequence of each one written next to it.
 *
 * The review threshold is the interesting one: dragging it changes how much work the
 * queue asks for and how many duplicates go unfound, and both effects are visible in
 * the metrics bar as it moves. What it cannot do is change the automatic merges —
 * those come from the mailbox and phone rules, not from a score, and no threshold
 * promotes a resemblance into one.
 */
export function ConfigPanel({
  config,
  onChange,
  onReset,
}: {
  config: CleanConfig;
  onChange: (config: CleanConfig) => void;
  onReset: () => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Configuration</h2>
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-900 dark:hover:text-slate-100"
        >
          reset to defaults
        </button>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <Slider
          label="review threshold"
          value={config.reviewThreshold}
          onChange={(reviewThreshold) => onChange({ ...config, reviewThreshold })}
          note="Above this, a probable pair is queued for a human. It never causes an automatic merge — lower it to see more suggestions, including wrong ones."
        />
        <Slider
          label="name gate"
          value={config.nameGate}
          min={0.5}
          onChange={(nameGate) => onChange({ ...config, nameGate })}
          note="A pair whose names agree less than this is dropped outright, whatever the company and domain say. It is what stops two strangers at one employer from scoring well."
        />

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={config.blocking}
            onChange={(event) => onChange({ ...config, blocking: event.target.checked })}
            className="mt-1 size-4"
          />
          <span>
            <span className="font-medium">Blocking</span>
            <span className="mt-1 block text-xs text-slate-500">
              Only compare rows that share a cheap key. Turn it off to run the exhaustive
              comparator — the same clusters, roughly 120× the comparisons. That equivalence is
              asserted in the test suite.
            </span>
          </span>
        </label>

        <label className="text-sm">
          <span className="font-medium">Default phone region</span>
          <select
            value={config.defaultPhoneRegion}
            onChange={(event) => onChange({ ...config, defaultPhoneRegion: event.target.value })}
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {["US", "CA", "GB", "IE", "IN", "AU", "DE", "FR", "NL", "SG", "BR", "ZA", "AE"].map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            Applied to numbers written without a country code. A number with a `+` prefix always
            keeps its own.
          </span>
        </label>
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Source trust, most trusted first</legend>
        <p className="mt-1 text-xs text-slate-500">
          The third rung of the survivorship chain, and it is asked <em>before</em> recency —
          &ldquo;newest wins&rdquo; is the usual default and it is wrong here, because the newest
          touch is often a bought list overwriting the CRM record.
        </p>
        <ol className="mt-2 flex flex-wrap gap-2">
          {config.sourceTrust.map((source, index) => (
            <li key={source} className="flex items-center gap-1">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => {
                  const sourceTrust = [...config.sourceTrust];
                  [sourceTrust[index - 1], sourceTrust[index]] = [sourceTrust[index], sourceTrust[index - 1]];
                  onChange({ ...config, sourceTrust });
                }}
                className="rounded-md border border-slate-300 px-2 py-1 font-mono text-xs disabled:opacity-30 dark:border-slate-700"
                aria-label={`move ${source} up`}
              >
                ↑
              </button>
              <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs dark:bg-slate-900">
                {index + 1}. {source}
              </span>
            </li>
          ))}
        </ol>
      </fieldset>
    </section>
  );
}

function Slider({
  label,
  value,
  onChange,
  note,
  min = 0.5,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  note: string;
  min?: number;
}) {
  return (
    <label className="text-sm">
      <span className="flex items-baseline justify-between">
        <span className="font-medium">{label}</span>
        <span className="font-mono tabular-nums">{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={1}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-sky-600"
      />
      <span className="mt-1 block text-xs text-slate-500">{note}</span>
    </label>
  );
}
