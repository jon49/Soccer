import type { Teams } from "./db.js";

export const isSelected =
  <T extends string>(currentValue: string | undefined) =>
  (value: T) =>
    value === currentValue ? "selected" : null;

export const reject = (s: string | string[]): Promise<any> =>
  typeof s === "string" ? Promise.reject([s]) : Promise.reject(s);

export function cleanHtmlId(s: string) {
  return s.replace(/[\W_-]/g, "-");
}

export function getProperty<T>(obj: any, prop: string): T | undefined {
  // @ts-ignore
  if (typeof obj === "object" && prop in obj) {
    // @ts-ignore
    return obj[prop];
  }
  return;
}

export function equals(a: string, b: string) {
  return a.localeCompare(b, void 0, { sensitivity: "base" }) === 0;
}

export function sort<T>(array: T[], f: (x: T) => string) {
  return array.sort((a, b) => f(a).localeCompare(f(b), void 0, { sensitivity: "base" }));
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

export function tail<T>(xs: T[]): T {
  return xs.slice(-1)[0];
}

export function cssRes(css: string) {
  return {
    body: css,
    headers: {
      "Content-Type": "text/css",
    },
  };
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
