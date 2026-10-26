// import { getMany, setMany, set, update } from "./db.js"
// import * as db from "./global-model.js"
import { authFetch } from "./api-client.js";
import { spacesForget, teamMoveLocal } from "./repo-share.js";
import { isMovedTeam, isTeamKey, movesIn } from "./share-logic.js";
import {
  canonicalKey,
  pendingAfterSync,
  pendingWithoutSpaces,
  spacesDiff,
  syncRequest,
  type SpaceCursors,
  type SyncItem,
} from "./sync-logic.js";
import { errorToPlain, logSyncError, logSyncInfo } from "./sync-log.js";

const {
  db: { getMany, setMany, set, update, get },
  globalDb,
} = self.sw;

const SYNC_URL = "/api/data/soccer";

export interface SyncResult {
  status: number;
  messages: string[];
}

export default async function sync(): Promise<SyncResult> {
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

  let updatedData = await getMany(newData.saved.map((x) => parse(x.key)));
  let updatedRevisionsTask = [];
  for (let index = 0; index < updatedData.length; index++) {
    let d = updatedData[index];
    let { key, id } = newData.saved[index];
    if (d) {
      d._rev = id;
      updatedRevisionsTask.push(set(parse(key), updatedData[index], false));
    } else {
      console.error("Could not find the key to update the revision!", key, id);
      await logSyncError("could not find key to update revision", { key, id });
    }
  }

  if (newData.conflicted?.length) {
    console.error(
      "soccer sync: server rejected local change(s); keeping them queued for retry:",
      newData.conflicted,
    );
    await logSyncError("server rejected local change(s); keeping them queued for retry", {
      conflicted: newData.conflicted,
    });
  }

  let remoteSpaces = newData.spaces ?? {};
  let { added, removed } = spacesDiff(spaces, remoteSpaces);
  let messages = (await spacesForget(removed)).map((x) => `You no longer have access to "${x}".`);

  await Promise.all([
    ...updatedRevisionsTask,
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
    update(
      "updated",
      (val) => pendingWithoutSpaces(pendingAfterSync(val, newData.saved), removed) ?? val,
      { sync: false },
    ),
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
    pendingRawAfter: Array.from(rawUpdatedAfter ?? []),
  });

  if (toSaveNewData.length > 0 || added.length > 0 || removed.length > 0 || moves.length > 0) {
    return { status: 200, messages };
  }
  return { status: 204, messages };
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
