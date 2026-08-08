# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Framework-specific rules live in `AGENTS.md` (written and maintained by
`next dev`) — read it before touching anything under `app/`.

## Project state

Day 003 of a 100-day building challenge, **shipped**. `PLAN.md` is the
agreed scope and the source of truth: it came out of a decision-by-decision
interview, so every choice in it is deliberate rather than a default. Read it
before writing code, and do not quietly widen the MVP.

The master backlog lives at `~/Desktop/100-days-portfolio-execution-plan.md`.
Day 001 is `../icp-score`, Day 002 is `../enrichment-waterfall`. This project
mirrors their stack and their **pure engine + thin route + UI as viewer** shape.
When a convention here is ambiguous, check what `enrichment-waterfall` did.

**What it is:** record linkage over messy lead data. Normalize five fields,
generate candidate pairs by blocking, refuse impossible merges, split the rest
into an auto-merge tier and a human-review tier, cluster under must-not-link
constraints, then resolve surviving field values with a rule chain that records
provenance. No model, no network, no key, no random source.

## Commands

```bash
npm run dev              # next dev
npm run build            # next build
npm run typecheck        # next typegen && tsc --noEmit
npm run lint             # eslint
npm test                 # vitest run
npm run test:watch
npm run sweep            # threshold sweep -> the README precision/recall table

npx vitest run lib/match/cluster.test.ts        # one file
npx vitest run -t "order independence"          # one test by name
```

`npm run typecheck && npm run lint && npm test` is the gate. All three clean
before anything is called done.

## Architecture

`PLAN.md` has the full file tree and the data model; `README.md` will have the
walkthrough. The parts that matter across files:

**The engine is pure.** Nothing under `lib/` may import `next/*` or `node:*`,
read `process.env`, or call `fetch` / `Date.now` / `Math.random` — CSV parsing
included, since it takes a string and returns rows.
`lib/clean/purity.test.ts` greps for exactly that, over an explicit directory
list that grows by hand as the engine lands. Purity is
load-bearing, not hygiene: it is what lets the default run happen entirely in
the browser, which is what lets the README claim an uploaded CSV never leaves
the user's machine.

**One orchestration path.** `clean(rows, config, constraints)` in
`lib/clean/run.ts` is the only pipeline. The API route calls it, the browser
calls it, `scripts/sweep.ts` calls it, the tests call it. Never add a second.

**Stages are total.** `parse → normalize → triage → block → refuse → score →
apply constraints → cluster → survive → metrics`. No stage exits early and no
stage swallows a decision — refused edges and skipped blocks are reported, not
dropped.

**Constraints are an input, not UI state.** Human accept/reject decisions arrive
as `Constraint[]` alongside rows and config. That keeps `clean()` pure and keeps
a run replayable by someone who wasn't there; the constraint set serialises into
`audit.json`.

**No seed and no random source.** Day 002 needed a seed because it simulated
vendors. Here determinism is structural. A run is identified by `runHash` — a
hash of config + constraints + input ids. Do not introduce a seed input.

**The default run happens in the browser.** `app/components/CleanerConsole.tsx`
calls `clean()` directly, which is what makes the "your CSV never leaves your
machine" claim true. `/api/clean` exists for scripting and calls the same
function.

**Order independence is structural, not incidental.** Pair keys are canonical
(`a < b`), cluster ids derive from the lowest member id, and every returned
collection is sorted. If you add a collection to `CleanResult`, sort it.

**Similarity primitives are hand-written** in `lib/text/` — Jaro-Winkler,
token-set overlap, phonetic key, nickname table, initial compatibility. Zero
dependencies is deliberate: a library at exactly those points hides the work the
project exists to show. Same reasoning for the CSV parser and the E.164
formatter.

## Non-negotiable invariants

These are the project's claims. Breaking one silently invalidates the README.

1. **A probable match never auto-merges.** A false merge is unrecoverable — two
   people become one row and the loser's data is gone. A missed merge is a
   review item. The whole design follows from that asymmetry.
2. **Auto-tier precision is 1.0** on the labelled dataset. If that test fails,
   an authoritative rule is wrong — fix the rule, not the test.
3. **Role addresses are not identity.** `info@`, `sales@`, `hello@` never
   satisfy the authoritative email rule — a shared inbox is three people, and
   merging on one is the most common false merge in real CRM data. Free-mail is
   a *separate* question and the two get conflated constantly: `bob@gmail.com`
   is one human's mailbox, so it does identify a person. What it does not
   identify is an employer, which is why `EmailKind` keeps `freemail` distinct
   from `personal` and only `personal` may supply a company domain.
4. **Refusals are evaluated first and win outright**, including human
   `must-not-link`. A union that would violate one is recorded as refused, never
   silently performed.
5. **Nothing merges on company similarity alone** — the name component must
   clear `config.nameGate` or the pair is dropped regardless of total score.
6. **No row disappears.** `rows in === clustered members + quarantined`, and
   quarantined rows still reach `cleaned.csv` marked as such. Silently dropping
   rows is the worst failure mode in this category of tool.
7. **Conflicts are surfaced, not resolved away.** When two non-empty normalized
   values disagree, the winner is recorded *and* the loser is kept in
   `provenance.conflicts`.
8. **Order independence.** Shuffled input ⇒ byte-identical output.
9. **No LLM anywhere in the path.** A model deciding identity makes the result
   unreproducible and unauditable, and the portfolio angle is deterministic
   workflows.
10. **Zero config.** No API key, no env var, no network call. If a change needs
    one, it is out of scope.

## Numbers that appear in the README

The threshold sweep table, the dedup rate, the pair-reduction ratio and the
precision/recall figures all come from real runs over `data/leads.ts`. **If you
change a weight, a threshold, a normalization rule or the dataset, rerun
`npm run sweep` and update the README tables** — otherwise the prose starts
lying and only a reader will notice. Tests assert the shape of those claims.

Current: 150 rows to 100 people, auto precision 1.000, auto recall 0.958, a
two-item queue that reaches 1.000, 91 comparisons against 10,296 exhaustive
(113x), 6 quarantined, 44 flagged conflicts, 318 tests.

`reviewThreshold` is 0.85 **because the sweep says so** — it is the lowest value
whose queue still contains only true pairs. Do not nudge it without rerunning
`npm run sweep` and updating the README's calibration table and its bolded row.

## Data

`data/leads.ts` is 150 synthetic rows on reserved `.example` domains, labelled
with `truePersonId`. The distribution is *engineered*, not sampled: each row
proves a specific path — nickname, typo, plus/dot alias, initials-only,
phone-only overlap, formatting-only twin — and the **hard negatives** matter
most: father/son sharing a name at one company, two same-named people at one
company with different emails, and one person appearing at two companies after
a job change. Annotate any row you add with what it proves, and keep the
README's dataset table in sync. A real domain must never appear — there is a
test.

## Scope boundaries

Out of scope, each belonging to a later day or a documented next step in
`PLAN.md` — do not quietly build them:

- Title normalization beyond light casing (Day 011 `title-normalizer`).
- Company-name → domain resolution (Day 013 `domain-detective`).
- Account-level dedup as a product, hierarchy, CRM writeback.
- Persistence, auth, multi-user review, streaming ingest, learned thresholds,
  merge undo.

## Deploy

Vercel, default Node runtime, no configuration and no environment variables.
Nothing is deployed and no git remote is changed without an explicit go-ahead.
Remote: `github.com/akshatiwarix/lead-cleaner`. The build is pushed after every
completed step in `PLAN.md`'s task order, each one green on the gate first.
