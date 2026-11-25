import type { Updated } from "./db.js";

// The server always echoes `saved[].key` as the canonical JSON encoding of
// the key value (e.g. the string key "teams" comes back as the 8-character
// string `"teams"`, quote characters included). Locally, `db.ts`'s
// `_updated()` only JSON.stringifies array keys on the way in — a plain
// string/number key is stored bare. Canonicalize both sides the same way
// before comparing, or a bare-string key (currently just "teams") never
// matches what the server confirms and stays queued forever, even though
// the server did save it.
export function canonicalKey(key: unknown): string {
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

// Compares two versions of a record by content, ignoring `_rev`.
function sameContent(a: unknown, b: unknown): boolean {
  let strip = (x: any) => (x && typeof x === "object" ? { ...x, _rev: undefined } : x);
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

// Applies the server's confirmation of `saved` to the records as they are
// locally *now*. Every record takes its new revision, but only one that is
// still what was sent leaves the pending queue: a record edited while the
// request was in flight has a change the server never got, so it stays
// queued. `sent` maps canonical keys to the data that went out; `current`
// lines up with `saved`.
export function confirmSaved(
  saved: { key: unknown; id: number }[],
  sent: Map<string, unknown>,
  current: unknown[],
): { records: [unknown, any][]; confirmed: { key: string }[]; missing: unknown[] } {
  let records: [unknown, any][] = [];
  let confirmed: { key: string }[] = [];
  let missing: unknown[] = [];
  saved.forEach(({ key, id }, i) => {
    let record: any = current[i];
    if (!record) {
      missing.push(key);
      return;
    }
    let canonical = canonicalKey(key);
    let wasSent = sent.has(canonical);
    if (wasSent && sameContent(sent.get(canonical), record)) {
      confirmed.push({ key: canonical });
    }
    records.push([key, { ...record, _rev: id }]);
  });
  return { records, confirmed, missing };
}

// Space uuid -> sync cursor, one per shared team this user belongs to.
export type SpaceCursors = Record<string, number>;

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

// A key belongs to a space when its second element (the team id) is one of
// the spaces we're in. Everything else, including the bare "teams" key, is
// personal.
export function spaceOf(key: unknown, spaces: SpaceCursors): string | undefined {
  return Array.isArray(key) && typeof key[1] === "string" && has(spaces, key[1])
    ? key[1]
    : undefined;
}

export interface SyncItem {
  key: unknown;
  data: any;
  id: number;
  space?: string;
}

export function syncRequest(
  lastSyncedId: number,
  spaces: SpaceCursors,
  items: { key: unknown; data: any }[],
) {
  let data: SyncItem[] = items.map(({ key, data }) => {
    let item: SyncItem = { key, data, id: data?._rev ?? 0 };
    let space = spaceOf(key, spaces);
    if (space) item.space = space;
    return item;
  });
  return { lastSyncedId, spaces, data };
}

// `remote` is the server's full list of spaces we're in. Anything we track
// that it leaves out means we were removed or the space was deleted.
export function spacesDiff(
  local: SpaceCursors,
  remote: SpaceCursors,
): { added: string[]; removed: string[] } {
  return {
    added: Object.keys(remote).filter((x) => !has(local, x)),
    removed: Object.keys(local).filter((x) => !has(remote, x)),
  };
}

export function keysInSpaces<K>(keys: K[], spaces: string[]): K[] {
  let set = new Set(spaces);
  return keys.filter((key) => Array.isArray(key) && set.has(key[1]));
}

// Drops pending keys that belong to spaces we lost access to. Sending one
// would get the whole batch refused with a 403, forever.
export function pendingWithoutSpaces(
  updated: Updated | undefined,
  spaces: string[],
): Updated | undefined {
  if (!updated || !spaces.length) return updated;
  let set = new Set(spaces);
  for (let key of updated) {
    let value = typeof key === "string" && key.startsWith("[") ? JSON.parse(key) : key;
    if (Array.isArray(value) && set.has(value[1])) updated.delete(key);
  }
  return updated;
}
