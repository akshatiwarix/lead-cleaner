/**
 * Dates, read strictly or not at all.
 *
 * Recency is the fourth rung of the survivorship chain, so a misread date does
 * not throw an error — it silently hands a field to the wrong record. `03/04/2026`
 * is the 3rd of April in most of the world and the 4th of March in the US, and
 * nothing in a CSV says which. So an ambiguous two-digit-day-and-month format is
 * *refused*, and refusal means the chain falls through to the next rung instead of
 * acting on a coin flip.
 *
 * `Date.parse` is not used: it accepts far more than this, including the same
 * ambiguous forms, with behaviour that has historically varied between engines.
 * A run has to be reproducible everywhere, and the purity test forbids the clock
 * for the same reason.
 */

const ISO = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/;
/** `Feb 4, 2026`, `4 Feb 2026`, `February 4 2026`. */
const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const NAMED_DAY_FIRST = /^(\d{1,2})[\s-]+([\p{L}]{3,})\.?[\s,-]+(\d{4})$/u;
const NAMED_MONTH_FIRST = /^([\p{L}]{3,})\.?[\s-]+(\d{1,2})(?:st|nd|rd|th)?[\s,-]+(\d{4})$/u;
/** Unambiguous only because a day above 12 cannot be a month. */
const SLASHED = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;

function assemble(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  // Rejecting the 31st of February matters less than never emitting a string that
  // sorts wrongly, and ISO strings sort correctly whether or not the date exists.
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}

/**
 * Returns `YYYY-MM-DD`, or undefined when the input cannot be read *unambiguously*.
 * The output is a plain string on purpose: ISO dates compare correctly with `<`,
 * so nothing downstream needs a Date object or a timezone.
 */
export function normalizeTimestamp(raw?: string): string | undefined {
  const input = (raw ?? "").trim();
  if (input.length === 0) return undefined;

  const iso = ISO.exec(input);
  if (iso) return assemble(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dayFirst = NAMED_DAY_FIRST.exec(input);
  if (dayFirst) {
    const month = MONTH_NAMES[dayFirst[2].slice(0, 3).toLowerCase()];
    if (month !== undefined) return assemble(Number(dayFirst[3]), month, Number(dayFirst[1]));
  }

  const monthFirst = NAMED_MONTH_FIRST.exec(input);
  if (monthFirst) {
    const month = MONTH_NAMES[monthFirst[1].slice(0, 3).toLowerCase()];
    if (month !== undefined) return assemble(Number(monthFirst[3]), month, Number(monthFirst[2]));
  }

  const slashed = SLASHED.exec(input);
  if (slashed) {
    const first = Number(slashed[1]);
    const second = Number(slashed[2]);
    const year = Number(slashed[3]);

    // Exactly one ordering can be right when one number is above 12.
    if (first > 12 && second <= 12) return assemble(year, second, first);
    if (second > 12 && first <= 12) return assemble(year, first, second);

    // Both are 12 or below: genuinely ambiguous. Refuse, so the survivorship
    // chain falls through to its deterministic tiebreak rather than acting on a
    // guess about which locale wrote the file.
    return undefined;
  }

  return undefined;
}
