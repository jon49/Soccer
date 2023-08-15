import { Revision, get } from "./db.js";

function parseKey(key: unknown) : string | number {
    return typeof key === "string" && key.startsWith("[")
        ? JSON.parse(key)
    : key
}

const settingDefaults : Settings = {
    lastSyncedId: 0,
    _rev: 0
}

class GlobalDB {
    async updated() : Promise<(string | number)[]> {
        return Array.from((await get("updated")) ?? new Set).map(parseKey)
    }

    async isLoggedIn() : Promise<boolean> {
        return (await get("loggedIn")) ?? false
    }

    async settings() : Promise<Settings> {
        return { ...settingDefaults, ...((await get("settings")) ?? {}) }
    }
}

export const globalDB = new GlobalDB

export interface Settings extends Revision {
    earliestDate?: string
    lastSyncedId: number
}

