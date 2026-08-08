/**
 * The three files a run produces.
 *
 * `cleaned.csv` — one row per surviving person, plus the quarantined rows marked as
 * such. This is the file someone loads back into a CRM, and the reason quarantine
 * exists: 150 rows in, 150 rows out, nothing silently dropped.
 *
 * `review.csv` — the pending pairs, so a reviewer can work offline in the tool they
 * already use rather than in this one.
 *
 * `audit.json` — the whole result plus the config and constraints that produced it.
 * This is the portfolio artifact and the reproducibility claim: hand it to someone
 * who was not in the room, and they can re-run `clean()` and get the same answer.
 * It is why constraints are an input rather than UI state.
 */

import type { CleanResult, Cluster, Constraint, FieldName, InputRow } from "../clean/types.ts";
import { toCsv } from "../csv/parse.ts";

const FIELDS: FieldName[] = ["fullName", "email", "phone", "company", "domain", "title"];

const HEADERS = [
  "person_id",
  "status",
  "row_count",
  "merged_from",
  "full_name",
  "email",
  "phone",
  "company",
  "domain",
  "title",
  "conflicts",
  "match_strength",
  "quarantine_reason",
];

/** `title: "VP" vs "Director"` — the losing values, inline, so the CSV carries them too. */
function conflictSummary(cluster: Cluster): string {
  return FIELDS.flatMap((field) => {
    const provenance = cluster.provenance[field];
    if (provenance === undefined || provenance.conflicts.length === 0) return [];
    const losing = provenance.conflicts.map((conflict) => `"${conflict.value}" (${conflict.id})`);
    return [`${field}: kept "${provenance.value}" over ${losing.join(", ")}`];
  }).join(" | ");
}

export function cleanedCsv(result: CleanResult, rows: InputRow[]): string {
  const byId = new Map(rows.map((row) => [row.id, row]));

  const clustered = result.clusters.map((cluster) => [
    cluster.id,
    cluster.memberIds.length > 1 ? "merged" : "unique",
    String(cluster.memberIds.length),
    cluster.memberIds.join(" "),
    cluster.canonical.fullName,
    cluster.canonical.email,
    cluster.canonical.phone,
    cluster.canonical.company,
    cluster.canonical.domain,
    cluster.canonical.title,
    conflictSummary(cluster),
    cluster.strength,
    "",
  ]);

  // Quarantined rows keep their original values: the point is that a human can see
  // exactly what was held back and decide, not that the tool cleaned them.
  const held = result.quarantined.map((item) => {
    const row = byId.get(item.id);
    return [
      item.id,
      "quarantined",
      "1",
      item.id,
      row?.mapped.fullName ?? [row?.mapped.firstName, row?.mapped.lastName].filter(Boolean).join(" "),
      row?.mapped.email,
      row?.mapped.phone,
      row?.mapped.company,
      row?.mapped.website,
      row?.mapped.title,
      "",
      "",
      item.reason,
    ];
  });

  return toCsv([HEADERS, ...clustered, ...held]);
}

export function reviewCsv(result: CleanResult, rows: InputRow[]): string {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const describe = (id: string) => {
    const row = byId.get(id);
    return [
      row?.mapped.fullName ?? [row?.mapped.firstName, row?.mapped.lastName].filter(Boolean).join(" "),
      row?.mapped.email,
      row?.mapped.phone,
      row?.mapped.company,
    ];
  };

  const headers = [
    "score", "decision",
    "row_a", "name_a", "email_a", "phone_a", "company_a",
    "row_b", "name_b", "email_b", "phone_b", "company_b",
    "reasons",
  ];

  const body = result.review.map((edge) => [
    edge.score.toFixed(3),
    // Left blank on purpose: this column is where the reviewer writes `link` or
    // `must-not-link`, and the file comes back as a constraint set.
    "",
    edge.a,
    ...describe(edge.a),
    edge.b,
    ...describe(edge.b),
    edge.reasons.map((reason) => `${reason.rule}: ${reason.detail}`).join(" | "),
  ]);

  return toCsv([headers, ...body]);
}

export function auditJson(result: CleanResult, constraints: Constraint[]): string {
  return JSON.stringify(
    {
      // Everything needed to reproduce the run, and nothing that would need a clock
      // to generate — a timestamp here would make two identical runs differ.
      runHash: result.runHash,
      config: result.config,
      constraints,
      metrics: result.metrics,
      clusters: result.clusters,
      review: result.review,
      refused: result.refused,
      quarantined: result.quarantined,
    },
    null,
    2,
  );
}
