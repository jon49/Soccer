import { Theme } from "../user-settings/edit.html.js"
import { get as get1, getMany, setMany, set as set1, update as update1 } from "./lib/db.min.js"

const get : DBGet = get1

const _updated =
    async (key: string) => {
        await update1("updated", (val?: Map<string, number>) => {
            if (val instanceof Set) {
                let temp : Map<string, number> = new Map()
                Array.from(val).forEach(x => temp.set(x, 0))
                val = temp
            }
            return (val || new Map()).set(key, Date.now())
        })
    }

function set<K extends keyof DBAccessors>(key: K, value: DBAccessors[K], sync?: boolean): Promise<void>
function set<T>(key: string, value: T, sync?: boolean): Promise<void>
async function set(key: string, value: any, sync = true) {
    await set1(key, value)
    if (sync) {
        await _updated(key)
    }
}

function update<K extends keyof DBAccessors>(key: K, f: (val: DBAccessors[K]) => DBAccessors[K], sync?: { sync: boolean }): Promise<void>
function update<T>(key: string, f: (val: T) => T, sync?: { sync: boolean }): Promise<void>
async function update(key: string, f: (v: any) => any, sync = { sync: true }) {
    await update1(key, f)
    if (sync.sync) {
        await _updated(key)
    }
}

class TempCache1 {
    async push(value: Partial<TempCache>) {
        if (value instanceof Object && !Array.isArray(value))
            await update1("temp-cache", x => x ? { ...x, ...value as {}} : value as {})
    }
    async pop<K extends keyof TempCache>(key: K): Promise<TempCache[K] | undefined> {
        let result = await get("temp-cache")
        await update1("temp-cache", x => {
            if (x && x[key]) {
                delete x[key]
                return x
            }
            return x
        })
        return result ? result[key] : undefined
    }
}

const cache = new TempCache1()
export { update, set, get, getMany, setMany, cache }

export interface Settings {
    lastSyncedId?: number | undefined
    theme: Theme
}

export interface Stats {
    id: number
    name: string
}

export interface Game {
    id: number
    name: string
}

export interface PlayerGame {
    gameId: number
    stats: {statId: number, count: number}[]
    gameTime: { start: number, end?: number }[]
}

export interface Player {
    name: string
    games: PlayerGame[]
}

export interface TeamPlayer {
    name: string
    active: boolean
}

export interface Team {
    name: string
    year: string
    players: TeamPlayer[]
}

export interface TeamSingle {
    name: string
    year: string
    active: boolean
}
export type Teams = TeamSingle[]

export interface CacheTeams {
    name?: string
    year?: string
    posted?: boolean
}

export interface CachePlayers {
    name?: string
    posted?: boolean
}

export interface TempCache {
    message?: any
    teams?: CacheTeams
    players: CachePlayers
}

export type Updated = Map<IDBValidKey, number>

interface DBAccessors {
    updated: Updated
    settings: Settings
    teams: Teams
    "temp-cache": TempCache
}

interface DBGet {
    (key: "updated"): Promise<Updated | undefined>
    (key: "settings"): Promise<Settings | undefined>
    (key: "teams"): Promise<Teams | undefined>
    (key: "temp-cache"): Promise<TempCache | undefined>
    <T>(key: string): Promise<T | undefined>
}

export type FormReturn<T> = { [key in keyof T]: string|undefined }
