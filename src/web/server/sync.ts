// import { getMany, setMany, set, update } from "./db.js"
// import * as db from "./global-model.js"
import { authFetch } from "./api-client.js";
import { spacesForget, teamMoveLocal } from "./repo-share.js";
import { isMovedTeam, isTeamKey, movesIn } from "./share-logic.js";
import {
  canonicalKey,
  confirmSaved,
  pendingAfterSync,
  pendingWithoutSpaces,
  spacesDiff,
  syncRequest,
  type SpaceCursors,
  type SyncItem,
} from "./sync-logic.js";
import { errorToPlain, logSyncError, logSyncInfo } from "./sync-log.js";

const {
  db: { getMany, setMany, update, get, transaction, promisifyRequest },
  globalDb,
} = self.sw;

const SYNC_URL = "/api/data/soccer";

export interface SyncResult {
  status: number;
  messages: string[];
}

// One sync at a time: a manual sync, auto-sync and other tabs all share this
// service worker, and two rounds in flight at once would each confirm keys
// against stale reads. A sync asked for while one runs waits its turn.
let running: Promise<unknown> = Promise.resolve();

export default function sync(): Promise<SyncResult> {
  let result = running.then(syncWithRetry, syncWithRetry);
  running = result.catch(() => {});
  return result;
}

async function syncWithRetry(): Promise<SyncResult> {
  let result = await syncOnce(true);
  if (result.status !== 403) return result;

  // A 403 means some item names a space we're no longer in. Learn the current
  // membership with a data-free sync (which drops the lost spaces and their
  // pending keys), then retry once. Never loop.
  await logSyncInfo("sync refused (403); refreshing space membership");
  let probe = await syncOnce(false);
  if (probe.status !== 200 && probe.status !== 204) return probe;
  let retry = await syncOnce(true);
  return {
    status: probe.status === 200 && retry.status === 204 ? 200 : retry.status,
    messages: [...probe.messages, ...retry.messages],
  };
}

async function syncOnce(withData: boolean): Promise<SyncResult> {
  let rawUpdated = await get<Set<unknown>>("updated");
  let keys = withData ? await globalDb.updated() : [];
  const items = await getMany(keys);
  const settings = await globalDb.settings();
  const lastSyncedId = settings.lastSyncedId ?? 0;
  const spaces: SpaceCursors = settings.spaces ?? {};
  let postData = syncRequest(
    lastSyncedId,
    spaces,
    keys.map((key, i) => ({ key, data: items[i] })),
  );

  await logSyncInfo("sync start", {
    lastSyncedId,
    spaces,
    pendingRaw: Array.from(rawUpdated ?? []),
    pendingParsed: keys,
    outgoing: postData.data.map((d) => ({ key: d.key, id: d.id, space: d.space })),
  });

  let res;
  try {
    res = await postSync(postData);
  } catch (err) {
    await logSyncError("sync request failed", errorToPlain(err));
    throw err;
  }

  let newData: ResponseData;
  if (
    res.status >= 200 &&
    res.status <= 299 &&
    res.headers.get("Content-Type")?.startsWith("application/json")
  ) {
    newData = await res.json();
  } else {
    await logSyncError("sync response not ok", {
      status: res.status,
      contentType: res.headers.get("Content-Type"),
    });
    return { status: res.status, messages: [] };
  }

  let toSaveNewData: [any, any][] = [];
  for (let saved of newData.data) {
    let key = parse(saved.key);
    let data = parse(saved.data);
    data._rev = saved.id;
    toSaveNewData.push([key, data]);
  }

  // A personal team that was moved into a shared team (by this user on
  // another device) leaves a tombstone on ["team", t]. It can arrive in
  // `conflicted` too, when this device just sent its own ["team", t].
  let moves = movesIn([
    ...toSaveNewData.map(([key, data]) => ({ key, data })),
    ...(newData.conflicted ?? []).map((x) => ({ key: parse(x.key), data: parse(x.data) })),
  ]);
  let movedIds = new Set([
    ...moves.map((x) => x.from),
    ...(await locallyMovedTeamIds(toSaveNewData.map(([key]) => key))),
  ]);
  // The old personal rows of a moved team are dead; don't store them.
  toSaveNewData = toSaveNewData.filter(
    ([key]) => !Array.from(movedIds).some((id) => isTeamKey(key, id)),
  );
  await setMany(toSaveNewData);

  let sent = new Map(keys.map((key, i) => [canonicalKey(key), items[i]]));
  let { missing, kept } = await applySaved(
    newData.saved.map((x) => ({ key: parse(x.key), id: x.id })),
    sent,
  );
  for (let key of missing) {
    console.error("Could not find the key to update the revision!", key);
    await logSyncError("could not find key to update revision", { key });
  }

  // The server saves every upload, so the latest write wins. `conflicted`
  // lists keys another device also changed since our last sync: our version
  // was saved over theirs.
  if (newData.conflicted?.length) {
    let message = "another device also changed these; this device's version was saved over theirs";
    console.warn(`soccer sync: ${message}:`, newData.conflicted);
    await logSyncInfo(message, { conflicted: newData.conflicted });
  }

  let remoteSpaces = newData.spaces ?? {};
  let { added, removed } = spacesDiff(spaces, remoteSpaces);
  let messages = (await spacesForget(removed)).map((x) => `You no longer have access to "${x}".`);

  await Promise.all([
    update(
      "settings",
      (val) => ({
        ...val,
        lastSynced: +new Date(),
        lastSyncedId: newData.lastSyncedId,
        // Keep any space added locally while this request was in flight (e.g.
        // a team shared just now); the server didn't know about it yet.
        spaces: { ...unsentSpaces(val?.spaces, spaces), ...remoteSpaces },
      }),
      { sync: false },
    ),
    update("updated", (val) => pendingWithoutSpaces(val, removed) ?? val, { sync: false }),
  ]);

  // Runs after the pending set is updated so a re-queued tombstone isn't
  // dropped as "saved". Unsynced edits to the old team, including the ones
  // just sent as personal rows, carry over into the shared team.
  if (moves.length) {
    let carry = new Set([...keys, ...(await globalDb.updated())].map(canonicalKey));
    for (let { from, to } of moves) {
      let member = to in remoteSpaces;
      await teamMoveLocal(from, to, (key) => member && carry.has(canonicalKey(key)));
    }
  }

  let rawUpdatedAfter = await get<Set<unknown>>("updated");
  await logSyncInfo("sync complete", {
    saved: newData.saved,
    lastSyncedId: newData.lastSyncedId,
    spaces: remoteSpaces,
    spacesAdded: added,
    spacesRemoved: removed,
    teamsMoved: moves,
    editedInFlight: kept,
    pendingRawAfter: Array.from(rawUpdatedAfter ?? []),
  });

  if (toSaveNewData.length > 0 || added.length > 0 || removed.length > 0 || moves.length > 0) {
    return { status: 200, messages };
  }
  return { status: 204, messages };
}

// Stamps the server's new revisions onto the saved records and drops them from
// the pending queue, in one transaction so no edit can land between reading a
// record and dequeuing it. A record edited since it was sent stays queued.
async function applySaved(saved: { key: any; id: number }[], sent: Map<string, unknown>) {
  return transaction("readwrite", async (store) => {
    let [updated, ...current] = await Promise.all([
      promisifyRequest<Set<IDBValidKey> | undefined>(store.get("updated")),
      ...saved.map((x) => promisifyRequest(store.get(x.key))),
    ]);
    let { records, confirmed, missing } = confirmSaved(saved, sent, current);
    for (let [key, record] of records) store.put(record, key as IDBValidKey);
    let pending = pendingAfterSync(updated, confirmed);
    if (pending) store.put(pending, "updated");
    await promisifyRequest(store.transaction);
    let kept = records
      .map(([key]) => key)
      .filter((key) => !confirmed.some((x) => x.key === canonicalKey(key)));
    return { missing, kept };
  });
}

// Personal team ids among `keys` whose local ["team", t] is already a
// tombstone.
async function locallyMovedTeamIds(keys: unknown[]): Promise<number[]> {
  let ids = Array.from(
    new Set(
      keys
        .filter((x): x is [string, number] => Array.isArray(x) && typeof x[1] === "number")
        .map((x) => x[1]),
    ),
  );
  let teams = await getMany(ids.map((x) => ["team", x]));
  return ids.filter((_, i) => isMovedTeam(teams[i]));
}

function unsentSpaces(current: SpaceCursors | undefined, sent: SpaceCursors): SpaceCursors {
  let result: SpaceCursors = {};
  for (let [space, cursor] of Object.entries(current ?? {})) {
    if (!(space in sent)) result[space] = cursor;
  }
  return result;
}

function postSync(body: PostData) {
  return authFetch(SYNC_URL, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    keepalive: true,
  });
}

function parse(value: any) {
  return typeof value === "string" && ["{", "[", `"`].includes(value[0])
    ? JSON.parse(value)
    : value;
}

interface PostData {
  lastSyncedId: number;
  spaces: SpaceCursors;
  data: SyncItem[];
}

interface ResponseData {
  data: SyncItem[];
  saved: SavedDto[];
  conflicted: ConflictedDto[];
  lastSyncedId: number;
  spaces?: SpaceCursors;
}

interface SavedDto {
  key: string;
  id: number;
  space?: string;
}

interface ConflictedDto {
  key: string;
  data?: string;
  id: number;
  timestamp: string;
  space?: string;
}
