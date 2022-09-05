import { Theme } from "../user-settings/edit.html.js"
import { get as get1, getMany, setMany, set as set1, update as update1 } from "./lib/db.min.js"
import { reject } from "./repo.js"

const get : DBGet = get1

const _updated =
    async (key: string, revision: number) => {
        await update1("updated", (val?: Map<string, number>) => {
            return (val || new Map()).set(key, revision)
        })
    }

function set<K extends keyof DBAccessors>(key: K, value: DBAccessors[K], sync?: boolean): Promise<void>
function set<T>(key: string, value: T, sync?: boolean): Promise<void>
async function set(key: string, value: any, sync = true) {
    if (sync && "_rev" in value) {
        if ("_rev" in value) {
            await _updated(key, value._rev)
        } else {
            return reject(`Revision number not specified! For "${key}".`)
        }
    }
    await set1(key, value)
    return
}

function update<K extends keyof DBAccessors>(key: K, f: (val: DBAccessors[K]) => DBAccessors[K], sync?: { sync: boolean }): Promise<void>
function update<T>(key: string, f: (val: T) => T, sync?: { sync: boolean }): Promise<void>
async function update(key: string, f: (v: any) => any, sync = { sync: true }) {
    await update1(key, f)
    if (sync.sync) {
        let o : any = await get(key)
        if (o && "_rev" in o) {
            await _updated(key, o._rev)
        } else {
            reject(`Revision number not found for "${key}".`)
        }
    }
}

class TempCache1 {
    async push(value: Partial<TempCache>) : Promise<undefined> {
        if (value instanceof Object && !Array.isArray(value)) {
            await update1("temp-cache", x => x ? { ...x, ...value as {}} : value as {})
        }
        return
    }

    async peek<K extends keyof TempCache>(key: K): Promise<TempCache[K] | undefined> {
        let result = await get("temp-cache")
        return result ? result[key] : void 0
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
        return result ? result[key] : void 0
    }

    async try<T>(p: Promise<T>) {
        return p.catch(x => this.push(x))
    }
}

const cache = new TempCache1()
export { update, set, get, getMany, setMany, cache }

export interface Settings {
    lastSyncedId?: number | undefined
    theme: Theme
}

interface Revision {
    _rev: number
}

export interface Stat {
    id: number
    name: string
}

export interface Stats extends Revision {
    stats: Stat[]
}

export interface Position {
    id: number
    name: string
}

export interface Positions extends Revision {
    positions: Position[]
}

export interface Activity {
    id: number
    name: string
}

export interface Activities extends Revision {
    activities: Activity[]
}

export interface Game {
    id: number
    date: string
    opponent?: string
    status?: "play" | "paused"
    points: number
    opponentPoints: number
    gameTime: { start: number, end?: number }[]
}

export interface GameTime {
    start?: number
    end?: number
    positionId: number 
}

export interface PlayerGame extends Revision {
    playerId: number
    gameId: number
    stats: {statId: number, count: number}[]
    gameTime: GameTime[]
    status?: { playerId?: number, _: "onDeck" } | { _: "inPlay" } | { _: "out" } | { _: "notPlaying" }
}

export interface TeamPlayer {
    id: number
    active: boolean
    name: string
}

export interface Team extends Revision {
    id: number
    name: string
    active: boolean
    year: string
    players: TeamPlayer[]
    games: Game[]
    positions: Position[]
}

export interface TeamSingle {
    id: number
    active: boolean
    name: string
    year: string
}

export interface Teams extends Revision {
    teams: TeamSingle[]
}

export interface CacheTeams {
    name?: string
    year?: string
}

export interface CachePlayers {
    name?: string
}

export type Message = string[] | undefined

export interface TempCache {
    message?: Message
    posted?: string
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
