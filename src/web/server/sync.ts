import { getMany, setMany, update } from "./db.js"
import db from "./global-model.js"
import api, { UpdatedDataResponse } from "./api.js"

const keyMap = {
    "player-game": "a",
    "team": "b",
    "positions": "c",
    "game-notes": "d",
}

export default async function sync() {
    let credentials = await db.credentials()
    if (!credentials) return { status: 403 }

    let lastUpdated = (await db.settings()).lastUpdated
    let latestData = await api.getLatestData(lastUpdated)

    let keys = await db.updated()
    const items = await getMany(keys)
    const responseTasks = new Array<Promise<UpdatedDataResponse>>(keys.length)
    for (let index = 0; index < items.length; index++) {
        let id = serializeKey(keys[index])
        if (latestData.items.some(x => x.id === id)) continue
        let value = items[index]
        responseTasks[index] = api.upsertData({
            id,
            updated: value.updated,
            value,
            userId: credentials.record.id,
        })
    }

    let serverSavedData = await Promise.all(responseTasks)
    // .catch(err => {
    //     console.error(err)
    //     debugger
    //     return <UpdatedDataResponse[]>[]
    // })
    let toSave = serverSavedData.map(x => [deserializeKey(x.id), x.value])

    let newLastUpdated =
        serverSavedData.reduce((acc, val) =>
           val.updated > acc ? val.updated : acc, lastUpdated)

    await Promise.all([
        setMany(<any>toSave),
        update("settings", val => ({
            ...val,
            lastSynced: newLastUpdated, }), { sync: false }),
        update("updated", val => (val?.clear(), val), { sync: false })])

    if (toSave.length > 0) {
        return { status: 200 }
    }
    return { status: 204 }
}

function serializeKey(key: string | number | any[]) {
    if (!key) throw new Error("Key is undefined.")
    if (Array.isArray(key)) {
        // @ts-ignore
        let keyName = keyMap[key[0]]
        if (!keyName) throw new Error(`Key "${key[0]}" not found in keyMap.`)
        key = `${keyName},${key.slice(1).join("-")}`
    }

    // If key is not string or number then make it a string.
    if (typeof key !== "string") {
        key = ""+key
    }

    return key.padEnd(15, "-")
}

function deserializeKey(key: string) {
    if (!key) throw new Error("Key is undefined.")
    key = key.replace(/-+$/, "")
    if (key.includes(",")) {
        let keyName = key[0]
        let keyArgs = key.slice(1).split("-").map(x => +x)
        // @ts-ignore
        let keyMapName = Object.keys(keyMap).find(k => keyMap[k] === keyName)
        if (!keyMapName) throw new Error(`Key "${keyName}" not found in keyMap.`)
        return [keyMapName, ...keyArgs]
    }
    return key
}

