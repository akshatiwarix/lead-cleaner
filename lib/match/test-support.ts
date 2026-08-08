import { demoRows } from "../../data/leads.ts";
import { normalizeRows } from "../normalize/index.ts";
import type { CleanConfig, InputRow, NormalizedRecord } from "../clean/types.ts";

/** The shipped defaults, so tests measure what a user would see. */
export const CONFIG: CleanConfig = {
  reviewThreshold: 0.85,
  nameGate: 0.8,
  sourceTrust: ["crm-export", "enrichment", "form-fill", "event-list", "purchased-list"],
  blocking: true,
  maxBlockSize: 200,
  defaultPhoneRegion: "US",
};

export function records(config: CleanConfig = CONFIG): NormalizedRecord[] {
  return normalizeRows(demoRows(), config);
}

export function recordsById(config: CleanConfig = CONFIG): Map<string, NormalizedRecord> {
  return new Map(records(config).map((record) => [record.id, record]));
}

/** A hand-built row, for the cases the dataset does not need to carry. */
export function row(id: string, mapped: InputRow["mapped"]): InputRow {
  return { id, mapped, raw: {} };
}

export function normalizeOne(id: string, mapped: InputRow["mapped"], config: CleanConfig = CONFIG): NormalizedRecord {
  return normalizeRows([row(id, mapped)], config)[0];
}

/**
 * A deterministic shuffle.
 *
 * The order-independence test needs a *different* order, not a random one — the
 * engine has no random source and neither may its tests, or a failure would not
 * reproduce. This is a fixed permutation driven by the array length.
 */
export function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = (i * 7 + 3) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
