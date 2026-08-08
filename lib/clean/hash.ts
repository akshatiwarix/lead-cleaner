/**
 * A short, stable content hash.
 *
 * Used for `runHash`, which identifies a run by its inputs — config, constraints and
 * row ids. There is no seed in this project because there is no random source, so a
 * hash is the honest identifier: two runs with the same hash produced the same
 * output, and someone handed an `audit.json` can check that they reproduced it.
 *
 * FNV-1a, written out because it has to be identical in every environment. A crypto
 * digest would mean `node:crypto` on the server and `SubtleCrypto` in the browser —
 * two implementations, an async API, and a purity-test violation, to identify a run
 * that is not a security boundary.
 */
export function contentHash(value: unknown): string {
  const text = stableStringify(value);

  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    // The FNV prime, by shifts, so the result stays inside 32 bits in JS.
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    hash = hash >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * `JSON.stringify` with object keys sorted, so two structurally equal inputs hash
 * the same however they were built.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);

  return `{${entries.join(",")}}`;
}
