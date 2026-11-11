import type { TeamPlayer, TeamPlayerStatus, Teams } from "./db.js";

export const reject = (s: string | string[]): Promise<any> =>
  typeof s === "string" ? Promise.reject([s]) : Promise.reject(s);

export function equals(a: string, b: string) {
  return a.localeCompare(b, void 0, { sensitivity: "base" }) === 0;
}

export function getNewId(ids: number[]) {
  return Math.max(0, ...ids) + 1;
}

// New personal team ids skip shared (uuid) ids and any id retired by moving
// that team into a shared one.
export function getNewTeamId(teams: Teams | undefined) {
  return getNewId([
    ...(teams?.teams ?? []).map((x) => x.id).filter((x): x is number => typeof x === "number"),
    ...(teams?.retiredIds ?? []),
  ]);
}

// A game's date ("2026-11-01") for people: "Sun, Nov 1, 2026".
export function formatGameDate(date: string): string {
  let d = new Date(`${date}T00:00:00`);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString([], {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// A game's start time ("10:00") for people: "10:00 AM", or "TBD" if unset.
export function formatGameTime(time: string | undefined): string {
  if (!time) return "TBD";
  let d = new Date(`2000-01-01T${time}`);
  if (isNaN(d.getTime())) return time;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Today in the device's time zone, as a game date ("2026-11-01").
export function todayDateString(): string {
  let d = new Date();
  let month = String(d.getMonth() + 1).padStart(2, "0");
  let day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

// A game's date in a narrow column: "Nov 1".
export function formatShortDate(date: string): string {
  let d = new Date(`${date}T00:00:00`);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function playerStatus(player: TeamPlayer): TeamPlayerStatus {
  return !player.active ? "inactive" : player.sub ? "sub" : "active";
}

const statusOrder: Record<TeamPlayerStatus, number> = { active: 0, sub: 1, inactive: 2 };

// How players are listed on the Players page and in the stats tables: active,
// then subs, then inactive, each by name.
export function playersInOrder<T extends TeamPlayer>(players: T[]): T[] {
  return [...players].sort(
    (a, b) =>
      statusOrder[playerStatus(a)] - statusOrder[playerStatus(b)] ||
      (a.name ?? "").localeCompare(b.name ?? ""),
  );
}
