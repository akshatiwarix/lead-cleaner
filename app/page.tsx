import { LEADS, demoRows } from "@/data/leads";
import { DEFAULT_CONFIG } from "@/lib/clean/config";
import { CleanerConsole } from "./components/CleanerConsole";

/**
 * A server component whose only job is to hand the client the dataset and the
 * defaults. There is nothing environment-dependent to resolve — no key, no vendor,
 * no network — so everything below this line runs in the browser.
 */
export default function Home() {
  const people = new Set(LEADS.map((lead) => lead.truePersonId)).size;

  return (
    <main className="mx-auto flex w-full max-w-[110rem] flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">LeadCleaner</h1>
        <p className="max-w-3xl text-sm text-slate-600 dark:text-slate-400">
          Record linkage for messy lead data. Normalize five fields, compare only the pairs worth
          comparing, refuse the ones that cannot be one person, merge the ones a mailbox or a phone
          line proves, and hand everything else to a human. Every merge carries the edges that
          formed it and, for each surviving field, which row won and why.
        </p>
        <p className="max-w-3xl text-xs text-slate-500">
          A false merge is unrecoverable — two people become one row and the loser&rsquo;s data is
          gone. A missed merge is a review item. Everything here follows from that asymmetry: nothing
          built out of resemblance ever merges automatically, however high it scores.
        </p>
        <p className="text-xs text-slate-500">
          {LEADS.length} synthetic rows covering {people} people on reserved{" "}
          <code className="font-mono">.example</code> domains, engineered so each row proves a
          specific case — including the father and son who share a name, an employer and a phone
          line. No model, no network, no key. Same input, same output, every time.
        </p>
      </header>

      <CleanerConsole demo={demoRows()} defaultConfig={DEFAULT_CONFIG} />

      <footer className="border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-800">
        Day 003 of 100 ·{" "}
        <a className="underline underline-offset-2" href="https://github.com/akshatiwarix/lead-cleaner">
          source
        </a>{" "}
        · your own CSV is parsed and cleaned in the browser and never leaves your machine
      </footer>
    </main>
  );
}
