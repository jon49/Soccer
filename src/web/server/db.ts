import {
  createStore,
  delMany,
  get as get1,
  getMany,
  keys,
  promisifyRequest,
  setMany,
  set as set1,
  update as update1,
  type UseStore,
} from "idb-keyval";
import { reject } from "@jon49/sw/validation.js";

const get: DBGet = get1;

const _updated = async (key: IDBValidKey) => {
  await update1("updated", (val?: Updated) => {
    if (Array.isArray(key)) {
      key = JSON.stringify(key);
    }

    // If key is not string or number then make it a string.
    if (typeof key !== "string" && typeof key !== "number") {
      key = key.toString();
    }

    return (val || new Set()).add(key);
  });
};

function set<K extends keyof DBAccessors>(
  key: K,
  value: DBAccessors[K],
  sync?: boolean,
): Promise<void>;
function set<T>(key: string | any[], value: T, sync?: boolean): Promise<void>;
async function set(key: string | any[], value: any, sync = true) {
  // Write before queueing: a sync that confirms this key in between then sees
  // the new value, differing from what it sent, and leaves the key queued.
  await set1(key, value);
  if (sync && "_rev" in value) {
    await _updated(key);
  }
}

function update<K extends keyof DBAccessors>(
  key: K,
  f: (val: DBAccessors[K]) => DBAccessors[K],
  options?: { sync: boolean },
): Promise<void>;
function update<T>(key: string, f: (val: T) => T, options?: { sync: boolean }): Promise<void>;
async function update(key: string, f: (v: any) => any, options = { sync: true }) {
  await update1(key, f);
  if (options.sync) {
    let o: any = await get(key);
    if (o && "_rev" in o) {
      await _updated(key);
    } else {
      reject(`Revision number not found for "${key}".`);
    }
  }
}

// idb-keyval's own default database and store.
let store: UseStore | undefined;

// Runs `callback` in one transaction over the whole store, for reads and
// writes that must not interleave with other writes. Only await requests on
// `store` inside it, or the transaction commits early.
function transaction<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => T | PromiseLike<T>,
): Promise<T> {
  store ??= createStore("keyval-store", "keyval");
  return store(mode, callback);
}

export { update, set, get, getMany, setMany, keys, delMany, transaction, promisifyRequest };

export const themes = ["dark", "light", null] as const;
export type Theme = (typeof themes)[number];

export interface Settings {
  earliestDate?: string;
  lastSyncedId: number;
  // Space uuid -> sync cursor for every shared team we're in. Local-only,
  // like lastSyncedId (which now only covers personal rows).
  spaces?: Record<string, number>;
  lastSynced?: number;
  theme: Theme;
  disableAutoSyncDuringGame?: boolean;
}

export interface Revision {
  _rev: number;
}

export interface Version {
  _v: number;
}

export interface Positions extends Revision {
  positions: string[];
  grid: number[];
}

export interface PositionsV0 extends Revision, Version {
  positions: string[][];
}

export interface Stat {
  id: number;
  name: string;
  active: boolean;
}

export interface Stats extends Revision {
  stats: Stat[];
}

export interface GameTime {
  start: number;
  end?: number;
}

export type GameStatus = "play" | "paused" | "ended";

export interface Game {
  id: number;
  date: string;
  time?: string;
  home: boolean;
  opponent?: string;
  location?: string;
  // Legacy fields — the live values now live in a separate `GameState` record
  // (see `gameStateGet`). These remain only so games created before the split
  // can be migrated/read; new writes never touch them.
  status?: GameStatus;
  points?: number;
  opponentPoints?: number;
  gameTime?: GameTime[];
}

// The frequently-changing slice of a game, synced independently from the team
// record so in-game point/clock updates don't re-sync the whole team.
export interface GameState extends Revision {
  gameId: number;
  status?: GameStatus;
  points: number;
  opponentPoints: number;
  gameTime: GameTime[];
}

export interface PlayerGameTime {
  start?: number;
  end?: number;
  position: string;
}

export interface OnDeckPlayer {
  _: "onDeck";
  targetPosition: number | null;
}

export interface InPlayPlayer {
  _: "inPlay";
  position: number;
}

export interface OutPlayer {
  _: "out";
}

export interface NotPlayingPlayer {
  _: "notPlaying";
}

export type PlayerStatus = OnDeckPlayer | InPlayPlayer | OutPlayer | NotPlayingPlayer;

export interface PlayerGame extends Revision {
  playerId: number;
  gameId: number;
  stats: { statId: number; count: number }[];
  gameTime: PlayerGameTime[];
  status?: PlayerStatus;
}

export interface PlayerGameStatus<T extends PlayerStatus> extends Revision {
  playerId: number;
  gameId: number;
  stats: { statId: number; count: number }[];
  gameTime: PlayerGameTime[];
  status: T;
}

export interface TeamPlayer {
  id: number;
  active: boolean;
  name: string;
  number?: number;
}

// A personal team's id is a per-user integer. A shared team's id is its
// space uuid, so its keys can never collide with another coach's teams.
export type TeamId = number | string;

export interface Team extends Revision, PositionsV0 {
  id: TeamId;
  name: string;
  active: boolean;
  year: string;
  players: TeamPlayer[];
  games: Game[];
  basketballMode?: boolean;
  scheduleFileId?: string;
  staleAfterMinutes?: number;
}

export interface TeamSingle {
  id: TeamId;
  active: boolean;
  name: string;
  year: string;
}

export interface Teams extends Revision {
  // Personal teams only. Shared teams are found through `Settings.spaces`.
  teams: TeamSingle[];
  // Ids of personal teams that were moved into a shared team. Never reuse
  // one: the server still holds the old team's rows under it.
  retiredIds?: number[];
}

export type Updated = Set<IDBValidKey>;

interface DBAccessors {
  updated: Updated;
  settings: Settings;
  teams: Teams;
}

interface DBGet {
  (key: "updated"): Promise<Updated | undefined>;
  (key: "settings"): Promise<Settings | undefined>;
  (key: "teams"): Promise<Teams | undefined>;
  <T>(key: string | any[]): Promise<T | undefined>;
}

export type FormReturn<T> = { [key in keyof T]: string | undefined };
