import { Settings, Theme, get, set, update } from "./db.js";

function parseKey(key: unknown) : string | number {
    return typeof key === "string" && key.startsWith("[")
        ? JSON.parse(key)
    : key
}

const settingDefaults : Settings = {
    lastSyncedId: 0,
    lastSynced: 0,
    theme: null
}

export async function updated() : Promise<(string | number)[]> {
    return Array.from((await get("updated")) ?? new Set).map(parseKey)
}

export async function setLoggedIn(loggedIn: boolean) : Promise<void> {
    await set("loggedIn", loggedIn, false)
}

export async function isLoggedIn() : Promise<boolean> {
    return (await get("loggedIn")) ?? false
}

export async function settings() : Promise<Settings> {
    return { ...settingDefaults, ...((await get("settings")) ?? {}) }
}

export async function setTheme(theme: Theme) : Promise<void> {
    await update(
        "settings",
        v => ({ ...(v ?? settingDefaults), theme }),
        { sync: false })
}

