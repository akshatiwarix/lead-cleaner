import type { CleanConfig } from "./types.ts";

/**
 * The shipped defaults.
 *
 * `reviewThreshold` is 0.85 because that is what the sweep supports, not because it
 * felt right. `npm run sweep` measures every value against the dataset's labels:
 * 0.85 is the lowest threshold at which a reviewer who accepts the whole queue
 * still ends up at precision 1.000 *and* recall 1.000 — two pairs to look at, both
 * of them real. Below it the queue starts including pairs that must be rejected, and
 * accept-everything precision falls: 0.980 at 0.80, 0.941 at 0.75, 0.873 at 0.60.
 * Dragging the slider down in the UI is how that degradation becomes visible.
 *
 * Note what does *not* move: automatic precision is 1.000 at every threshold,
 * because the automatic tier never reads this number. It merges on a shared mailbox
 * or a shared line, never on a score.
 *
 * `nameGate` is 0.80: below it, no amount of company or domain agreement can carry
 * a pair. It is what keeps two strangers at one employer from scoring well.
 *
 * `sourceTrust` is ordered most-trusted first and is the third rung of the
 * survivorship chain. The default ranking says a CRM record beats a bought list,
 * which is the ordering most GTM teams would recognise.
 */
export const DEFAULT_CONFIG: CleanConfig = {
  reviewThreshold: 0.85,
  nameGate: 0.8,
  sourceTrust: ["crm-export", "enrichment", "form-fill", "event-list", "purchased-list"],
  blocking: true,
  maxBlockSize: 200,
  defaultPhoneRegion: "US",
};
