import { get as get1, getMany, setMany, set as set1, update as update1 } from "./lib/db.min.js"
import { reject } from "./repo.js"

const get : DBGet = get1

const _updated =
    async (key: IDBValidKey) => {
        await update1("updated", (val?: Updated) => {
            if (Array.isArray(key)) {
                key = JSON.stringify(key)
            }

            // If key is not string or number then make it a string.
            if (typeof key !== "string" && typeof key !== "number") {
                key = key.toString()
            }

            return (val || new Set).add(key)
        })
    }

function set<K extends keyof DBAccessors>(key: K, value: DBAccessors[K], sync?: boolean): Promise<void>
function set<T>(key: string | any[], value: T, sync?: boolean): Promise<void>
async function set(key: string | any[], value: any, sync = true) {
    if (sync && "_rev" in value) {
        if ("_rev" in value) {
            await _updated(key)
        } else {
            return reject(`Revision number not specified! For "${key}".`)
        }
    }
    await set1(key, value)
    return
}

function update<K extends keyof DBAccessors>(key: K, f: (val: DBAccessors[K]) => DBAccessors[K], options?: { sync: boolean }): Promise<void>
function update<T>(key: string, f: (val: T) => T, options?: { sync: boolean }): Promise<void>
async function update(key: string, f: (v: any) => any, options = { sync: true }) {
    await update1(key, f)
    if (options.sync) {
        let o : any = await get(key)
        if (o && "_rev" in o) {
            await _updated(key)
        } else {
            reject(`Revision number not found for "${key}".`)
        }
    }
}

export { update, set, get, getMany, setMany }

export const themes = ["dark", "light", null] as const
export type Theme = typeof themes[number]

export interface Settings {
    earliestDate?: string
    lastSyncedId: number
    lastSynced?: number
    theme: Theme
}

export interface Revision {
    _rev: number
}

export interface Stats extends Revision {
    stats: { id: number, name: string }[]
}

export interface Positions extends Revision {
    positions: string[]
    grid: number[]
}

export interface Activity {
    id: number
    name: string
    active: boolean
}

export interface Activities extends Revision {
    activities: Activity[]
}

export interface GameTime {
    start: number
    end?: number
}

export interface Game {
    id: number
    date: string
    time?: string
    home: boolean
    opponent?: string
    status?: "play" | "paused" | "ended"
    points: number
    opponentPoints: number
    gameTime: GameTime[]
}

export interface PlayerGameTime {
    start?: number
    end?: number
    position: string 
}

export interface OnDeckPlayer {
    _: "onDeck"
    targetPosition: number
}

export interface InPlayPlayer {
    _: "inPlay"
    position: number
}

export interface OutPlayer {
    _: "out"
}

export interface NotPlayingPlayer {
    _: "notPlaying"
}

export type PlayerStatus = OnDeckPlayer | InPlayPlayer | OutPlayer | NotPlayingPlayer

export interface PlayerGame extends Revision {
    playerId: number
    gameId: number
    stats: {statId: number, count: number}[]
    gameTime: PlayerGameTime[]
    status?: PlayerStatus
}

export interface PlayerGameStatus<T extends PlayerStatus> extends Revision {
    playerId: number
    gameId: number
    stats: {statId: number, count: number}[]
    gameTime: PlayerGameTime[]
    status: T
}

export interface TeamPlayer {
    id: number
    active: boolean
    name: string
}

export interface Team extends Revision, Positions {
    id: number
    name: string
    active: boolean
    year: string
    players: TeamPlayer[]
    games: Game[]
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

export type Updated = Set<IDBValidKey>

interface DBAccessors {
    updated: Updated
    settings: Settings
    teams: Teams
}

interface DBGet {
    (key: "updated"): Promise<Updated | undefined>
    (key: "settings"): Promise<Settings | undefined>
    (key: "teams"): Promise<Teams | undefined>
    <T>(key: string | any[]): Promise<T | undefined>
}

export type FormReturn<T> = { [key in keyof T]: string|undefined }

