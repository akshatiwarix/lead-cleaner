import type { CleanConfig } from "./types.ts";

/**
 * The shipped defaults.
 *
 * `reviewThreshold` is 0.75 because that is where the review queue contains both
 * kinds of work: pairs a reviewer should accept and pairs they should reject. At
 * 0.82 the queue holds only true duplicates, which makes the demo look good and the
 * review path pointless. `scripts/sweep.ts` prints the full curve — the number here
 * is a default, not a claim, and the README publishes what it costs.
 *
 * `nameGate` is 0.80: below it, no amount of company or domain agreement can carry
 * a pair. It is what keeps two strangers at one employer from scoring well.
 *
 * `sourceTrust` is ordered most-trusted first and is the third rung of the
 * survivorship chain. The default ranking says a CRM record beats a bought list,
 * which is the ordering most GTM teams would recognise.
 */
export const DEFAULT_CONFIG: CleanConfig = {
  reviewThreshold: 0.75,
  nameGate: 0.8,
  sourceTrust: ["crm-export", "enrichment", "form-fill", "event-list", "purchased-list"],
  blocking: true,
  maxBlockSize: 200,
  defaultPhoneRegion: "US",
};
