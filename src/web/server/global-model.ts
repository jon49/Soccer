import { Revision, get, set } from "./db.js";

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

    async setLoggedIn(loggedIn: boolean) : Promise<void> {
        await set("loggedIn", loggedIn, false)
    }

    async isLoggedIn() : Promise<boolean> {
        return (await get("loggedIn")) ?? false
    }

    async settings() : Promise<Settings> {
        return { ...settingDefaults, ...((await get("settings")) ?? {}) }
    }
}

const globalDB = new GlobalDB
export default globalDB

export interface Settings extends Revision {
    earliestDate?: string
    lastSyncedId: number
}

