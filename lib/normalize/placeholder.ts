/**
 * Values that mean "empty" without being empty.
 *
 * A rep who does not know someone's phone number types `n/a`, and an export
 * that lost a field writes `NULL`. Both arrive as non-empty strings, and every
 * stage downstream treats them as data: `n/a` becomes a surname, `NULL` becomes
 * a company key, and then two rows with nothing in common match on it. A cluster
 * of everyone whose company is `unknown` is a specific, recognisable way for a
 * deduplicator to be wrong.
 *
 * So these are recognised and dropped — with a note, like every other change, so
 * the row's history still shows what was there.
 *
 * The list is deliberately short and only matches a *whole* field. `Unknown
 * Logistics` is a company, and a company called `None` would keep its name.
 */

const PLACEHOLDERS = new Set([
  "na", "n/a", "n.a.", "nil", "none", "null", "nan", "nothing", "empty", "blank",
  "unknown", "unspecified", "undefined", "missing", "notavailable", "noemail",
  "nophone", "noname", "nodata", "tbd", "tba", "pending", "test", "xxx", "xxxx",
  "asdf", "qwerty", "-", "--", "---", "?", "??", ".", "0", "00", "n\\a",
]);

/** True when the whole value is a stand-in for nothing. */
export function isPlaceholder(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) return true;
  if (PLACEHOLDERS.has(trimmed)) return true;
  // `n / a`, `no email`, `not available`: collapse the spacing and punctuation and
  // try again. Bounded by length so it cannot reach into a real value — every
  // entry in the list is a short word, so anything long enough to be a company
  // name or a person's name is out of range.
  if (trimmed.length <= 20) {
    const squeezed = trimmed.replace(/[^\p{L}\p{N}]/gu, "");
    return squeezed.length > 0 && PLACEHOLDERS.has(squeezed);
  }
  return false;
}

/** `undefined` if the value is absent or a placeholder; the value otherwise. */
export function orAbsent(value?: string): string | undefined {
  if (value === undefined) return undefined;
  return isPlaceholder(value) ? undefined : value;
}
