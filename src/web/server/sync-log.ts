// Local-only diagnostic log for troubleshooting sync. Never synced to the
// server (written with `sync: false`) and pruned to the last week so it
// can't grow unbounded on a device that's rarely opened.
import { get, update } from "./db.js";

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 200;

export interface SyncLogEntry {
  ts: number;
  level: "info" | "error";
  message: string;
  data?: unknown;
}

export function errorToPlain(err: unknown): unknown {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return err;
}

function prune(entries: SyncLogEntry[]): SyncLogEntry[] {
  let cutoff = Date.now() - MAX_AGE_MS;
  return entries.filter((e) => e.ts >= cutoff).slice(-MAX_ENTRIES);
}

async function append(level: SyncLogEntry["level"], message: string, data?: unknown) {
  await update<SyncLogEntry[]>(
    "syncLog",
    (val) => prune([...(val ?? []), { ts: Date.now(), level, message, data }]),
    { sync: false },
  );
}

export function logSyncInfo(message: string, data?: unknown): Promise<void> {
  return append("info", message, data);
}

export function logSyncError(message: string, data?: unknown): Promise<void> {
  return append("error", message, data);
}

export async function syncLogEntries(): Promise<SyncLogEntry[]> {
  return prune((await get<SyncLogEntry[]>("syncLog")) ?? []);
}
