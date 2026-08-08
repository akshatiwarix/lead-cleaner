/**
 * One cluster in, one canonical record out — with a receipt for every field.
 *
 * This file's only real job is deciding what counts as a *candidate* for each
 * field, because that is where the validity rung gets its meaning. A role address
 * is a real string that is not a person's address; an unparseable phone number is a
 * real string that is not a number. Both are marked invalid rather than dropped, so
 * they can still win a field nobody else filled in — and lose it to anything better.
 */

import type { Cluster, FieldName, NormalizedRecord } from "../clean/types.ts";
import type { RawCluster } from "../match/cluster.ts";
import { identifiesPerson } from "../normalize/email.ts";
import { type Candidate, pickWinner } from "./chain.ts";

const FIELDS: FieldName[] = ["fullName", "email", "phone", "company", "domain", "title"];

/** The value and usability of one field on one record. */
function candidate(field: FieldName, record: NormalizedRecord): Candidate {
  const common = { id: record.id, source: record.source, updatedAt: record.updatedAt };

  switch (field) {
    case "fullName":
      return { ...common, value: record.name.display, valid: record.name.last !== undefined };
    case "email":
      // The address as written wins the export, not the canonical form: nobody
      // wants `breyes@` in a file when the person's actual address is `b.reyes@`.
      // The canonical form exists to *match*, not to be handed back.
      return { ...common, value: record.email.normalized, valid: identifiesPerson(record.email.kind) };
    case "phone":
      return {
        ...common,
        value:
          record.phone.e164 === undefined
            ? undefined
            : record.phone.extension === undefined
              ? record.phone.e164
              : `${record.phone.e164} x${record.phone.extension}`,
        valid: record.phone.valid,
      };
    case "company":
      return { ...common, value: record.company.normalized, valid: record.company.key !== undefined };
    case "domain":
      return { ...common, value: record.domain.value };
    case "title":
      return { ...common, value: record.title.tidied };
  }
}

export function canonicalise(
  cluster: RawCluster,
  byId: Map<string, NormalizedRecord>,
  sourceTrust: string[],
): Cluster {
  const members = cluster.memberIds.map((id) => byId.get(id)!).filter((record) => record !== undefined);

  const canonical: Cluster["canonical"] = {};
  const provenance: Cluster["provenance"] = {};
  let conflictCount = 0;

  for (const field of FIELDS) {
    const winner = pickWinner(
      members.map((record) => candidate(field, record)),
      sourceTrust,
    );
    if (winner === undefined) continue;

    canonical[field] = winner.value;
    provenance[field] = winner;
    if (winner.conflicts.length > 0) conflictCount++;
  }

  return { ...cluster, canonical, provenance, conflictCount };
}
