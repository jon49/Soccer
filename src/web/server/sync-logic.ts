import type { Updated } from "./db.js";

// The server always echoes `saved[].key` as the canonical JSON encoding of
// the key value (e.g. the string key "teams" comes back as the 8-character
// string `"teams"`, quote characters included). Locally, `db.ts`'s
// `_updated()` only JSON.stringifies array keys on the way in — a plain
// string/number key is stored bare. Canonicalize both sides the same way
// before comparing, or a bare-string key (currently just "teams") never
// matches what the server confirms and stays queued forever, even though
// the server did save it.
function canonicalKey(key: unknown): string {
  let value = typeof key === "string" && key.startsWith("[") ? JSON.parse(key) : key;
  return JSON.stringify(value);
}

// Only keys the server actually confirmed (present in `saved`) are safe to
// drop from the pending queue. Anything else — rejected/conflicted, or
// simply omitted — must stay queued, or a local edit silently stops being
// retried even though the server never persisted it.
export function pendingAfterSync(
  updated: Updated | undefined,
  saved: { key: string }[],
): Updated | undefined {
  if (!updated) return updated;
  let savedKeys = new Set(saved.map((x) => x.key));
  for (let key of updated) {
    if (savedKeys.has(canonicalKey(key))) updated.delete(key);
  }
  return updated;
}
