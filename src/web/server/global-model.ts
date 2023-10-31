import { Credentials, get, set } from "./db.js";

function parseKey(key: unknown) : string | number {
    return typeof key === "string" && key.startsWith("[")
        ? JSON.parse(key)
    : key
}

const settingDefaults : Settings = {
    lastSynced: 0,
    lastUpdated: ""
}

class GlobalDB {
    async updated() : Promise<(string | number)[]> {
        return Array.from((await get("updated")) ?? new Set).map(parseKey)
    }

    credentials() : Promise<Credentials | undefined> {
        return get("credentials")
    }

    setCredentials(credentials: Credentials) {
        return set("credentials", credentials, false)
    }

    async settings() : Promise<Settings> {
        return { ...settingDefaults, ...((await get("settings")) ?? {}) }
    }

}

const globalDB = new GlobalDB
export default globalDB

export interface Settings {
    lastUpdated: string
    lastSynced?: number
}

