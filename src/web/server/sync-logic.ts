import type { Updated } from "./db.js";

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
    if (savedKeys.has(key as string)) updated.delete(key);
  }
  return updated;
}
