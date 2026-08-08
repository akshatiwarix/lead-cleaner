# Day 003 — LeadCleaner — Implementation Plan

Day 003 of a 100-day building challenge. The concept is fixed by the master
backlog (`~/Desktop/100-days-portfolio-execution-plan.md`): *a system for
cleaning, normalizing and deduplicating messy lead or CRM data.* Every choice
below came out of a decision-by-decision interview and is deliberate rather
than a default.

**Time limit:** one day. Feature-frozen at plan sign-off.

---

## Problem

Every CRM decays. The same human arrives three times — once from a webinar list
as `Bob Reyes / bob.reyes+webinar@acme.example`, once from a form fill as
`Robert Reyes / breyes@acme.example`, once from a purchased list as
`ROBERT REYES JR. / Acme, Inc.` with only a phone number. Reps work all three.
Sequences hit the same person twice. Territory counts and pipeline math are
computed over a denominator nobody trusts.

The tempting fix is a fuzzy-match button, and that fix is worse than the
disease. A missed merge is an inconvenience someone can fix later. A **false
merge is unrecoverable** — two people become one row, the loser's email and
history are gone, and no one notices for a year. So the interesting problem
isn't "find similar records", it's:

- Which merges am I willing to perform **automatically**, at what proven
  precision?
- Which merges do I hand to a human, and how do I make that decision cheap?
- When two records disagree about a field, which value survives, why, and where
  did the loser go?
- Can someone else re-run my exact result and get the same answer?

That is record linkage, and it is what this project builds.

## Intended user

A GTM engineer or RevOps person who has just been handed a CSV export and asked
how many accounts and people are actually in it. They need a defensible number,
a cleaned file, and an audit trail they can show the person who asks "why did
you merge those two?".

Secondary user: whoever reads the repo to judge whether the author understands
data quality or just discovered `toLowerCase()`.

## User journey

1. Land on the app. A 150-row messy demo dataset is already loaded — no upload,
   no key, no config required. The metrics bar reads `150 rows in → 100 people
   out`.
2. Scan the cluster list. Each merged cluster shows its members and the rule
   that joined them (`identical personal email`, `phone + compatible name +
   same company`).
3. Open a cluster. See every edge with its score and reasons, and the canonical
   record with **field-level provenance** — for each surviving value, which
   record won and which rule made it win. Conflicts are flagged in place with
   the losing value still visible.
4. Move to the review queue: pairs that scored above the review threshold but
   below auto-merge. Accept or reject each. Every decision is recorded as a
   `link` or `must-not-link` constraint and the run recomputes.
5. Drag the threshold. Watch precision/recall against the dataset's ground-truth
   labels move in real time, along with pending-review count.
6. Check the quarantine tab: rows with no usable identity key, each with a
   reason. Nothing was silently dropped.
7. Export `cleaned.csv`, `audit.json`, `review.csv`.
8. Or: drop in your own CSV. Columns are auto-mapped with manual override, and
   the file never leaves the browser.

## MVP scope (user-selected)

**In scope**

- Record linkage as the star: blocking → refusals → tiered matching →
  constrained clustering → survivorship → audit trail.
- **Person-level grain.** Company is a *matching signal* (blocking key, and a
  guard against merging same-named people at different companies), never a
  second merge product. Account grouping is a read-only view over the result.
- **Three-tier matching.** `authoritative` (auto-merge), `probable` (human
  review, never auto-merged), `distinct`. Plus explicit `refused` edges.
- **Must-not-link constraints**, both derived (two different personal emails at
  different domains cannot be one person) and human (a rejected review pair).
- Five normalization modules, each independently tested: name, email, phone,
  company, domain.
- Hand-rolled similarity primitives: Jaro-Winkler, token-set overlap, phonetic
  key, nickname table, initial-vs-full-name compatibility. Zero dependencies.
- Multi-key blocking with a reported pair-reduction ratio, and an exhaustive
  comparator behind a flag so a test can prove blocking loses no true pairs on
  the bundled dataset.
- Per-field survivorship rule chain with conflict flagging and provenance.
- Quarantine tier for rows with no identity key.
- Ground-truth labels on the bundled dataset, a threshold sweep, and a
  published precision/recall table.
- Browser-side execution by default; identical engine exposed at
  `POST /api/clean`.
- Three exports: `cleaned.csv`, `audit.json`, `review.csv`.
- BYO CSV with auto-detected column mapping, in memory only.

**Explicitly out of scope** (each belongs to a later day or a documented next
step — see Post-MVP)

- Any LLM. A model deciding identity makes the result unreproducible and
  unauditable, and the stated portfolio angle is *deterministic workflows*.
- Title normalization beyond light casing — Day 011 `title-normalizer` owns
  seniority and function extraction.
- Company-name → domain resolution — Day 013 `domain-detective` owns it.
- Account-level dedup as a product, CRM writeback, persistence, auth,
  multi-user review, incremental/streaming ingest of large files.

## Stack (user-selected)

Mirrors Day 001 `icp-score` and Day 002 `enrichment-waterfall` so the three
repos read as one body of work.

- Next 16 (App Router), React 19, TypeScript strict
- Tailwind v4
- zod — validating the CSV mapping and the `POST /api/clean` body
- vitest
- No runtime dependencies beyond the framework. The similarity functions,
  phonetic key, CSV parser and E.164 formatter are all written here, tested
  here, and readable in one sitting. A dependency at exactly those points would
  hide the work the project exists to show.

## APIs / data sources (user-selected)

**None.** No API key, no network call, no vendor. This is the first day in the
challenge with a genuinely zero-config run, and it falls out of the design
rather than being a limitation: the engine is pure, so the whole pipeline runs
client-side.

Data is `data/leads.ts` — 150 synthetic rows on reserved `.example` domains,
engineered so each row proves a specific path, and labelled with
`truePersonId` for scoring.

**No seed, and no random source anywhere.** Day 002 needed a seed because it
simulated vendors; here determinism is structural, not seeded. A seed input
would be theater. Runs are identified by a hash of `{config, constraints,
inputIds}` instead.

## Architecture

Same shape as Days 001–002: **pure engine + thin route + UI as viewer**.

```
data/leads.ts            150 engineered rows + truePersonId labels
lib/text/                similarity primitives — no domain knowledge
  jaro-winkler.ts        Jaro-Winkler with prefix boost
  token-set.ts           order-insensitive token overlap for company names
  phonetic.ts            Soundex-style key for blocking on surnames
  nicknames.ts           Bob↔Robert table + initial/full compatibility
lib/normalize/           one module per field, each returns value + NormNote[]
  name.ts email.ts phone.ts company.ts domain.ts
  index.ts               row → NormalizedRecord
lib/match/
  blocking.ts            candidate pairs from 6 keys; oversized blocks skipped
  refuse.ts              hard must-not-link rules, evaluated first
  rules.ts               authoritative tier + probable scoring
  constraints.ts         human link / must-not-link decisions
  cluster.ts             union-find honouring must-not-link
lib/survive/
  chain.ts               per-field winner + conflicts
  canonical.ts           cluster → CanonicalRecord + provenance
lib/clean/
  run.ts                 the one entry point: clean(rows, config, constraints)
  metrics.ts             counts, dedup rate, pair reduction, precision/recall
  types.ts
  purity.test.ts         greps lib/ for impurity
lib/export/              cleaned.csv · audit.json · review.csv writers
lib/csv/                 parser + header auto-mapping (zod-validated)
app/api/clean/route.ts   thin: validate body, call clean(), return JSON
app/                     Config · Clusters · Review · Quarantine · metrics bar
scripts/sweep.ts         threshold sweep → the README table
```

**The engine is pure.** Nothing under `lib/` outside `lib/csv` may import
`next/*` or `node:*`, read `process.env`, or call `fetch` / `Date.now` /
`Math.random`. `lib/clean/purity.test.ts` greps for exactly that, as Day 002
does. Purity is what allows the browser-side run, which is what allows the
privacy claim.

**One orchestration path.** `clean()` is the only pipeline. The route calls it;
the browser calls it; the sweep script calls it; the tests call it. There is
never a second path.

**Constraints are an input, not UI state.** Human review decisions arrive as
`Constraint[]` alongside the rows and config. That keeps `clean()` pure and
keeps the run replayable by someone who wasn't in the room — the constraint set
serialises into `audit.json`.

**Pipeline order** (each stage total, no early exits):

```
parse → normalize → triage(quarantine) → block → refuse → score
      → apply constraints → cluster → survive → metrics
```

## Data model

```ts
type InputRow = {
  id: string                       // stable, from the dataset; r{n} for uploads
  mapped: {
    fullName?: string; firstName?: string; lastName?: string
    email?: string; phone?: string; company?: string; website?: string
    title?: string; source?: string; updatedAt?: string
  }
  raw: Record<string, string>      // untouched, for the export
  truePersonId?: string            // labels — bundled dataset only
}

type NormNote = { rule: string; from: string; to: string }  // human-readable

type NormalizedRecord = {
  id: string
  name:    { first?: string; last?: string; honorific?: string; suffix?: string
             firstCanonical?: string; lastKey?: string; notes: NormNote[] }
  email:   { normalized?: string; canonical?: string; localPart?: string
             domain?: string
             kind: 'personal' | 'role' | 'freemail' | 'invalid' | 'missing'
             notes: NormNote[] }
  phone:   { e164?: string; extension?: string; valid: boolean; notes: NormNote[] }
  company: { normalized?: string; key?: string; notes: NormNote[] }
  domain:  { value?: string; source: 'website' | 'email' | 'none' }
  title:   { raw?: string; tidied?: string }
  source?: string
  updatedAt?: string
  blockKeys: string[]
}

type EdgeKind = 'authoritative' | 'probable' | 'refused'
type EdgeReason = { rule: string
                    verdict: 'match' | 'mismatch' | 'refuse'
                    detail: string; weight?: number }
type Edge = { a: string; b: string      // always a < b, so pairs are canonical
              kind: EdgeKind; score: number; reasons: EdgeReason[] }

type Constraint = { kind: 'link' | 'must-not-link'; a: string; b: string
                    by: 'derived' | 'human'; note?: string }

type FieldName = 'fullName' | 'email' | 'phone' | 'company' | 'domain' | 'title'
type Provenance = { winnerId: string; value: string; rule: string
                    conflicts: { id: string; value: string }[] }

type Cluster = {
  id: string                        // c-<lowest member id> — order-independent
  memberIds: string[]               // sorted
  strength: 'authoritative' | 'human-linked'
  edges: Edge[]
  canonical: Record<FieldName, string | undefined>
  provenance: Record<FieldName, Provenance>
  conflictCount: number
}

type Quarantined = { id: string; reason: string }
type ReviewItem = Edge            // probable, undecided

type CleanResult = {
  runHash: string                 // hash of config + constraints + input ids
  config: CleanConfig
  clusters: Cluster[]             // sorted by id; singletons included
  review: ReviewItem[]            // sorted by score desc, then id
  refused: Edge[]
  quarantined: Quarantined[]
  metrics: Metrics
}

type CleanConfig = {
  reviewThreshold: number         // default 0.82
  nameGate: number                // default 0.80 — no merge on company alone
  sourceTrust: string[]           // default crm-export > enrichment >
                                  // form-fill > event-list > purchased-list
  blocking: boolean               // false = exhaustive comparator
  maxBlockSize: number            // default 200; oversized blocks reported
  defaultPhoneRegion: string      // default 'US'
}
```

## States and workflows

**Match tiers, in evaluation order.** Refusals run first and win outright.

*Refusals (produce a derived `must-not-link`)*

- `R1` both records have a **personal** email, the canonical addresses differ,
  and the domains differ → cannot be one person.
- `R2` a human `must-not-link` constraint exists.

*Authoritative (auto-merge; must hold precision 1.0 on the labelled dataset)*

- `A1` identical canonical email **and** `kind === 'personal'`. Role addresses
  (`info@`, `sales@`, `hello@`) are explicitly **not** identity — this is the
  single most common false-merge source in real CRM data.
- `A2` identical E.164 phone **and** compatible names **and** (same company key
  **or** same domain).

*Probable (weighted sum → review queue, never auto-merged)*

| Component | Weight |
|---|---|
| name similarity (Jaro-Winkler, nickname- and initial-aware) | 0.45 |
| company key similarity (token-set) | 0.30 |
| domain equality | 0.15 |
| phone last-7 overlap | 0.10 |

Gated: the name component must clear `nameGate` or the pair is dropped
regardless of total. Nothing merges on company similarity alone.

**Clustering.** Union-find over authoritative edges plus human `link`
constraints. A union is refused if it would place a `must-not-link` pair in one
cluster; the refusal is recorded rather than swallowed. Cluster ids derive from
the lowest member id, and all collections are sorted, so output does not depend
on input order.

**Survivorship chain**, per field, first rule to discriminate wins:

1. non-empty beats empty
2. validity (valid E.164 over invalid; `personal` email over `role`/`freemail`)
3. source trust rank (`config.sourceTrust`)
4. recency (`updatedAt` descending)
5. lowest record id — a deterministic tiebreak, so there is always an answer

Two disagreeing non-empty normalized values raise a **conflict**: the winner is
recorded *and* the loser is retained in `provenance.conflicts`.

**Quarantine.** A row with no usable identity key — no email, no phone, and no
name+company pair — never enters matching. It is reported with a reason and
still appears in `cleaned.csv` marked `quarantined`. Silently dropping rows is
the worst failure mode in this category of tool.

**Blocking guard.** A block larger than `maxBlockSize` is skipped and reported
in metrics; the alternative is a quadratic blow-up on a single huge company.

## Implementation task order

Each step ends green (`typecheck && lint && test`) and is pushed before the
next begins.

1. **Scaffold.** Next 16 app, Tailwind v4, vitest, strict TS, `.gitignore`,
   `LICENSE`, `PLAN.md`, `CLAUDE.md`. Create `github.com/akshatiwarix/lead-cleaner`, push.
2. **Text primitives.** Jaro-Winkler, token-set, phonetic key, nickname table,
   initial compatibility — with tests, including the cases that motivate each.
3. **Normalization.** The five field modules + `NormalizedRecord` assembly.
   Tests per module, `NormNote` on every transformation.
4. **Dataset.** 150 rows, `truePersonId` labels, scenario annotations, and a
   dataset test asserting the distribution (real domains banned; hard negatives
   present).
5. **Matching.** Blocking, refusals, tiers, scoring, constraints, constrained
   union-find. Tests: blocking loses nothing, refusals hold, order independence.
6. **Survivorship + metrics.** Chain, conflicts, provenance, `clean()`
   assembly, `metrics.ts`, `purity.test.ts`, precision = 1.0 on the auto tier.
7. **Exports + API.** Three writers, `POST /api/clean` with a zod body, CSV
   parser and header auto-mapping.
8. **UI.** Config, cluster review with provenance drill-in, review queue,
   quarantine, metrics bar, CSV upload.
9. **Proof + docs.** `scripts/sweep.ts` → README threshold table, README,
   `docs/plain-english-guide.md`, architecture diagram, demo GIF, Vercel deploy.

## Validation / test plan

Four tests carry the README's claims. If one fails, the claim is false and the
test is right.

1. **Order independence.** Shuffle the bundled rows; `clusters`, `review` and
   `refused` must be byte-identical. Row order changing merge outcomes is the
   standard bug in this category.
2. **Purity.** A grep over `lib/` for `next/*`, `node:*`, `process.env`,
   `fetch`, `Date.now`, `Math.random`. Copied from Day 002 because it worked.
3. **Blocking loses nothing.** Every true pair found by the exhaustive
   comparator is also found under blocking, on the bundled dataset. The
   reported pair-reduction ratio is therefore honest.
4. **Auto-tier precision = 1.0.** Zero false merges in the authoritative tier
   against `truePersonId`. A false merge is unrecoverable; a missed merge is a
   review item. The asymmetry is the design.

Plus: unit tests per normalization module and per similarity function; a
survivorship suite covering each rung of the chain and the conflict path; a
constraints test proving a human `must-not-link` survives re-clustering; a
quarantine test proving no row disappears (`rows in === clustered + quarantined`);
a dataset test banning real domains; and a threshold sweep whose published
numbers are asserted in shape so the README cannot drift.

## Deployment plan

Vercel, default Node runtime, no special configuration and no environment
variables — there is nothing to configure. The default path runs entirely in
the browser; `/api/clean` exists for programmatic use.

Repo `github.com/akshatiwarix/lead-cleaner`, pushed after every step. Nothing
is deployed without an explicit go-ahead.

## README plan

Standard structure from the master plan, with these carrying the weight:

- **Why I Built This** — the false-merge asymmetry, stated up front.
- **Demo** — GIF of the threshold slider moving precision/recall and the
  review queue, plus one screenshot of a cluster's provenance panel.
- **How It Works** — the pipeline, stage by stage, with the rule tables.
- **Key Decisions & Tradeoffs** — no LLM; probable never auto-merges; role
  addresses aren't identity; browser-side execution; blocking's recall risk and
  the test that bounds it; quarantine over dropping.
- **Validation** — the four invariant tests and the threshold sweep table.
- **Limitations** — English-biased name handling, no transliteration, `US`
  default phone region, no household/account grain, in-memory only, and
  blocking's recall bound stated as a number.
- **What I'd Build Next** — the Post-MVP list, clearly separated.

## Definition of done

- [ ] `npm run typecheck && npm run lint && npm test` clean
- [ ] All four invariant tests present and passing
- [ ] Zero-config run works: clone, install, `npm run dev`, dataset already loaded
- [ ] Own-CSV path works end to end, data never leaves the browser
- [ ] Review accept/reject changes the result and survives export/replay
- [ ] Three exports produced and re-importable enough to reproduce the run
- [ ] Metrics bar numbers match the tests' numbers
- [ ] No real domains and no secrets in the repo
- [ ] README follows the structure, with the sweep table filled from a real run
- [ ] `docs/plain-english-guide.md`, diagram, demo GIF
- [ ] Deployed, repo public, Day 003 marked in the tracker

## Post-MVP (deliberately not built today)

- Account-level dedup as a first-class product, with hierarchy (subsidiary vs
  parent) — needs Day 013's domain resolution first.
- Learned thresholds — fit weights to the labels instead of hand-setting them,
  and report a calibration curve.
- Canopy clustering or sorted-neighbourhood blocking, with a measured recall
  comparison against multi-key blocking.
- Incremental dedup: match a new batch against an existing clean base without
  re-running everything.
- Merge *undo* — an audit trail that can be replayed backwards.
- CRM writeback (HubSpot/Salesforce) behind a dry-run diff.
- Streaming ingest for files too large for memory.
