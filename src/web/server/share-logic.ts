import type { TeamId, Teams } from "./db.js";
import { canonicalKey } from "./sync-logic.js";

// Every key that belongs to one team has the team id as its second element.
const TEAM_KEY_KINDS = new Set([
  "team",
  "positions",
  "stats",
  "game-state",
  "game-notes",
  "player-game",
]);

export function isTeamKey(key: unknown, teamId: TeamId): key is [string, TeamId, ...unknown[]] {
  return Array.isArray(key) && TEAM_KEY_KINDS.has(key[0]) && key[1] === teamId;
}

// What's left under ["team", t] after personal team t moved into a shared
// team. The server keeps the old personal rows forever, so this is how other
// devices learn to ignore them.
export interface MovedTeam {
  movedTo: string;
  _rev: number;
}

export function isMovedTeam(value: unknown): value is MovedTeam {
  return typeof (value as MovedTeam | undefined)?.movedTo === "string";
}

export interface TeamMove {
  from: number;
  to: string;
}

// Moves announced by tombstones in a batch of synced rows.
export function movesIn(rows: { key: unknown; data: unknown }[]): TeamMove[] {
  let moves = new Map<number, string>();
  for (let { key, data } of rows) {
    if (
      Array.isArray(key) &&
      key[0] === "team" &&
      typeof key[1] === "number" &&
      isMovedTeam(data)
    ) {
      moves.set(key[1], data.movedTo);
    }
  }
  return Array.from(moves, ([from, to]) => ({ from, to }));
}

export interface TeamMovePlan {
  puts: [unknown, unknown][];
  deletes: unknown[];
  // Keys to add to / drop from the pending-sync set.
  queue: unknown[];
  unqueue: unknown[];
  teams?: Teams;
}

// Moves personal team `from` into shared team `to`. `entries` are all the
// local keys of team `from`. Only the ones `rewrite` picks are copied over:
// all of them when sharing, or just the unsynced edits when another device
// learns about a move. The rest are dropped. ["team", from] becomes the
// tombstone, and `from` moves to the "teams" doc's retired ids.
export function planTeamMove(o: {
  from: number;
  to: string;
  entries: [unknown, any][];
  rewrite: (key: unknown) => boolean;
  teams: Teams | undefined;
}): TeamMovePlan {
  let { from, to, entries, rewrite, teams } = o;
  let plan: TeamMovePlan = { puts: [], deletes: [], queue: [], unqueue: [] };
  let oldTeam: any;

  for (let [key, value] of entries) {
    if (!isTeamKey(key, from)) continue;
    plan.unqueue.push(key);
    let isTeam = key[0] === "team";
    if (isTeam) oldTeam = value;
    else plan.deletes.push(key);
    if (!value || isMovedTeam(value) || !rewrite(key)) continue;

    let newKey = [...key];
    newKey[1] = to;
    let newValue = { ...value, _rev: 0 };
    if (isTeam) newValue.id = to;
    plan.puts.push([newKey, newValue]);
    plan.queue.push(newKey);
  }

  let teamKey = ["team", from];
  plan.puts.push([teamKey, { movedTo: to, _rev: oldTeam?._rev ?? 0 } satisfies MovedTeam]);
  // Only re-send the tombstone when we're the one that wrote over it.
  if (oldTeam && !isMovedTeam(oldTeam) && rewrite(teamKey)) plan.queue.push(teamKey);

  if (teams) {
    let listed = teams.teams.some((x) => x.id === from);
    let retired = teams.retiredIds?.includes(from);
    if (listed || !retired) {
      plan.teams = {
        ...teams,
        teams: teams.teams.filter((x) => x.id !== from),
        retiredIds: retired ? teams.retiredIds : [...(teams.retiredIds ?? []), from],
      };
      plan.queue.push("teams");
    }
  }

  return plan;
}

// Applies a plan's queue/unqueue to the pending-sync set, which stores array
// keys as their JSON and plain keys bare (see db.ts).
export function pendingAfterMove(
  updated: Set<unknown> | undefined,
  plan: Pick<TeamMovePlan, "queue" | "unqueue">,
): Set<unknown> {
  let drop = new Set(plan.unqueue.map(canonicalKey));
  let result = new Set<unknown>();
  for (let key of updated ?? []) {
    if (!drop.has(canonicalKey(key))) result.add(key);
  }
  for (let key of plan.queue) {
    result.add(Array.isArray(key) ? JSON.stringify(key) : key);
  }
  return result;
}
