// Sharing a team with other coaches. A shared team is a TrailBase "space"
// (see ../ImageBase): a set of users who all sync the same rows as equals.
// The team's id *is* the space id, so its keys never collide with anyone's
// personal teams.
//
// Like api-client.ts, this is loaded by shared.global.ts before `self.sw` is
// populated, so import siblings directly instead of using `self.sw`.
import { createStore, promisifyRequest } from "idb-keyval";
import { authFetch, OFFLINE_STATUS } from "./api-client.js";
import { getMany, type Settings, type Teams } from "./db.js";
import { canonicalKey, keysInSpaces } from "./sync-logic.js";
import { isTeamKey, pendingAfterMove, planTeamMove } from "./share-logic.js";

const APP = "soccer";

export type ApiResult<T> = { ok: true; json: T } | { ok: false; status: number; message: string };

async function api<T>(method: "GET" | "POST" | "DELETE", path: string): Promise<ApiResult<T>> {
  let res = await authFetch(path, { method, headers: { "Content-Type": "application/json" } });
  if (res.ok) return { ok: true, json: await res.json() };
  let message =
    res.status === OFFLINE_STATUS
      ? "You appear to be offline. Connect to the internet and try again."
      : res.status === 401
        ? "You need to log in first."
        : res.status === 404
          ? "Not found."
          : `Something went wrong (status ${res.status}).`;
  return { ok: false, status: res.status, message };
}

export interface SpaceMember {
  user: string;
  email: string;
  joined: number;
  me: boolean;
}

export interface Invite {
  code: string;
  expires: number;
}

export interface InvitePreview {
  space: string;
  invitedBy: string;
  expires: number;
  member: boolean;
}

const spaces = `/api/spaces/${APP}`;
const invites = `/api/invites/${APP}`;
const seg = encodeURIComponent;

export const spaceCreate = () => api<{ space: string }>("POST", spaces);

export const spaceMembers = (space: string) =>
  api<{ members: SpaceMember[] }>("GET", `${spaces}/${seg(space)}/members`);

// `user` is a member's `user` or "me" to leave. Removing the last member
// deletes the space and all its data.
export const spaceMemberRemove = (space: string, user: string) =>
  api<{}>("DELETE", `${spaces}/${seg(space)}/members/${seg(user)}`);

export const spaceInviteCreate = (space: string) =>
  api<Invite>("POST", `${spaces}/${seg(space)}/invites`);

export const invitePreview = (code: string) => api<InvitePreview>("GET", `${invites}/${seg(code)}`);

export const inviteAccept = (code: string) =>
  api<{ space: string }>("POST", `${invites}/${seg(code)}/accept`);

export function inviteUrl(code: string): string {
  return `${self.location.origin}/web/join/?code=${seg(code)}`;
}

/*** Local data ***/

// The same database idb-keyval's default helpers use. Opening it directly
// lets a team move happen in a single transaction, so a crash can't leave
// half a team behind.
const store = createStore("keyval-store", "keyval");

// Moves personal team `from` into shared team `to` (see planTeamMove).
// `rewrite` picks which of `from`'s keys carry over; anything else is
// dropped.
export function teamMoveLocal(
  from: number,
  to: string,
  rewrite: (key: unknown) => boolean,
): Promise<void> {
  return store("readwrite", async (s) => {
    let allKeys = await promisifyRequest(s.getAllKeys());
    let teamKeys = allKeys.filter((x) => isTeamKey(x, from));
    let [values, teams, updated, settings] = await Promise.all([
      Promise.all(teamKeys.map((x) => promisifyRequest(s.get(x)))),
      promisifyRequest<Teams | undefined>(s.get("teams")),
      promisifyRequest<Set<unknown> | undefined>(s.get("updated")),
      promisifyRequest<Settings | undefined>(s.get("settings")),
    ]);

    let plan = planTeamMove({
      from,
      to,
      entries: teamKeys.map((x, i) => [x, values[i]]),
      rewrite,
      teams,
    });

    for (let key of plan.deletes) s.delete(key as IDBValidKey);
    for (let [key, value] of plan.puts) s.put(value, key as IDBValidKey);
    if (plan.teams) s.put(plan.teams, "teams");
    s.put(pendingAfterMove(updated, plan), "updated");
    if (!(to in (settings?.spaces ?? {}))) {
      let base = settings ?? { lastSyncedId: 0, theme: null };
      s.put({ ...base, spaces: { ...base.spaces, [to]: 0 } }, "settings");
    }

    return promisifyRequest(s.transaction);
  });
}

// We left these spaces or lost access to them: delete every local key of
// those teams and stop tracking them. Returns the teams' names (for a
// message), read before they're gone.
export async function spacesForget(removed: string[]): Promise<string[]> {
  if (!removed.length) return [];
  let names = await getMany<{ name?: string } | undefined>(removed.map((x) => ["team", x]));
  await store("readwrite", async (s) => {
    let [allKeys, updated, settings] = await Promise.all([
      promisifyRequest(s.getAllKeys()),
      promisifyRequest<Set<unknown> | undefined>(s.get("updated")),
      promisifyRequest<Settings | undefined>(s.get("settings")),
    ]);
    let doomed = keysInSpaces(allKeys, removed);
    for (let key of doomed) s.delete(key);
    let drop = new Set(doomed.map(canonicalKey));
    s.put(new Set([...(updated ?? [])].filter((x) => !drop.has(canonicalKey(x)))), "updated");
    if (settings?.spaces) {
      let spaces = { ...settings.spaces };
      for (let x of removed) delete spaces[x];
      s.put({ ...settings, spaces }, "settings");
    }
    return promisifyRequest(s.transaction);
  });
  return names.map((x) => x?.name ?? "a shared team");
}
