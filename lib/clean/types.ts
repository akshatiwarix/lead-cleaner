/**
 * The whole contract, in one file.
 *
 * These types are the design: the tiers a pair can land in, the reasons an edge
 * carries, and the provenance a surviving value must be able to justify. Every
 * other module in `lib/` is an implementation of something declared here, so
 * this is the file to read first and the file to change last.
 *
 * `PLAN.md` explains why each of these exists. The short version: a false merge
 * is unrecoverable and a missed merge is a review item, so the type system is
 * arranged to make "merge automatically" the narrow path and "hand it to a
 * human with its reasons attached" the wide one.
 */

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** The columns the pipeline knows how to read. Everything else rides in `raw`. */
export type MappedFields = {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  website?: string;
  title?: string;
  source?: string;
  updatedAt?: string;
};

export type InputRow = {
  /**
   * Stable and content-bound, never positional — the bundled dataset carries
   * its own ids and uploads get `r{n}` at parse time. Ids are the tiebreak of
   * last resort in survivorship, so if they moved with row order the output
   * would too.
   */
  id: string;
  mapped: MappedFields;
  /** Untouched, so the export can hand back columns the pipeline ignored. */
  raw: Record<string, string>;
  /** Ground truth. Present only in the bundled dataset; drives the sweep. */
  truePersonId?: string;
};

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * One recorded transformation, in the words a user would use. The point of the
 * project is that every change to a value is explicable, so normalizers return
 * these rather than quietly rewriting a field.
 */
export type NormNote = { rule: string; from: string; to: string };

/**
 * How much an email address is allowed to mean. `personal` is the only kind
 * that can carry identity on its own: a shared `info@` address is the most
 * common false-merge source in real CRM data, and free-mail addresses say
 * nothing about which company someone works at.
 */
export type EmailKind = "personal" | "role" | "freemail" | "invalid" | "missing";

export type NormalizedName = {
  first?: string;
  last?: string;
  honorific?: string;
  suffix?: string;
  /** Nickname resolved to its canonical form: `Bob` -> `robert`. */
  firstCanonical?: string;
  /** Phonetic key on the surname, used for blocking. */
  lastKey?: string;
  notes: NormNote[];
};

export type NormalizedEmail = {
  normalized?: string;
  /** Provider-specific canonicalization (Gmail dots and `+tags`) applied. */
  canonical?: string;
  localPart?: string;
  domain?: string;
  kind: EmailKind;
  notes: NormNote[];
};

export type NormalizedPhone = {
  e164?: string;
  extension?: string;
  valid: boolean;
  notes: NormNote[];
};

export type NormalizedCompany = {
  normalized?: string;
  /** Legal suffixes and punctuation stripped; the blocking and match key. */
  key?: string;
  notes: NormNote[];
};

export type NormalizedDomain = {
  value?: string;
  source: "website" | "email" | "none";
};

export type NormalizedRecord = {
  id: string;
  name: NormalizedName;
  email: NormalizedEmail;
  phone: NormalizedPhone;
  company: NormalizedCompany;
  domain: NormalizedDomain;
  /** Day 011 owns titles. Here they are tidied for display and nothing else. */
  title: { raw?: string; tidied?: string };
  source?: string;
  updatedAt?: string;
  blockKeys: string[];
};

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export type EdgeKind = "authoritative" | "probable" | "refused";

export type EdgeReason = {
  rule: string;
  verdict: "match" | "mismatch" | "refuse";
  detail: string;
  /** Contribution to the score, for probable components. */
  weight?: number;
};

export type Edge = {
  /** Canonical orientation: `a < b` always, so a pair has exactly one key. */
  a: string;
  b: string;
  kind: EdgeKind;
  score: number;
  reasons: EdgeReason[];
};

/**
 * A human's review decision, or one the pipeline derived for itself. These are
 * an *input* to `clean()`, never state the UI holds privately — that is what
 * keeps a run reproducible by someone who was not in the room.
 */
export type Constraint = {
  kind: "link" | "must-not-link";
  a: string;
  b: string;
  by: "derived" | "human";
  note?: string;
};

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type FieldName =
  | "fullName"
  | "email"
  | "phone"
  | "company"
  | "domain"
  | "title";

export type Provenance = {
  winnerId: string;
  value: string;
  /** Which rung of the survivorship chain decided it. */
  rule: string;
  /** Losing values that disagreed. Kept, never discarded. */
  conflicts: { id: string; value: string }[];
};

export type Cluster = {
  /** `c-<lowest member id>`, so cluster identity cannot depend on row order. */
  id: string;
  memberIds: string[];
  /** The weakest edge that formed it — an audit trail in one word. */
  strength: "singleton" | "authoritative" | "human-linked";
  edges: Edge[];
  canonical: Partial<Record<FieldName, string>>;
  provenance: Partial<Record<FieldName, Provenance>>;
  conflictCount: number;
};

export type Quarantined = { id: string; reason: string };

/** A probable pair nobody has ruled on yet. */
export type ReviewItem = Edge;

export type CleanConfig = {
  /** Above this, a probable pair becomes a review item rather than noise. */
  reviewThreshold: number;
  /** The name component's floor. Nothing merges on company similarity alone. */
  nameGate: number;
  /** Most-trusted source first; ties in completeness are broken by this order. */
  sourceTrust: string[];
  /** `false` runs the exhaustive comparator — the recall baseline in tests. */
  blocking: boolean;
  /** A block bigger than this is skipped and reported, not silently expanded. */
  maxBlockSize: number;
  defaultPhoneRegion: string;
};

export type Metrics = {
  rowsIn: number;
  quarantined: number;
  clusters: number;
  merged: number;
  dedupRate: number;
  autoMerged: number;
  pendingReview: number;
  refused: number;
  conflicts: number;
  comparisons: number;
  /** `comparisons / (n * (n - 1) / 2)` — the honest cost of blocking. */
  comparisonRatio: number;
  skippedBlocks: { key: string; size: number }[];
  /** Present only when the input carries `truePersonId`. */
  groundTruth?: {
    autoPrecision: number;
    autoRecall: number;
    withReviewPrecision: number;
    withReviewRecall: number;
    truePairs: number;
  };
};

export type CleanResult = {
  /**
   * Hash of config + constraints + input ids. There is no seed anywhere in this
   * project because there is no random source: determinism here is structural,
   * and a seed input would only be theater.
   */
  runHash: string;
  config: CleanConfig;
  clusters: Cluster[];
  review: ReviewItem[];
  refused: Edge[];
  quarantined: Quarantined[];
  metrics: Metrics;
};
