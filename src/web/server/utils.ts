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
