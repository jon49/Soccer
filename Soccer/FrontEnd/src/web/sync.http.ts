import { get, getMany, set, setMany, update, Updated } from "./server/db.js"
import html from "./server/html-template-tag.js"
import { reject } from "./server/repo.js"
import { Route, RoutePostArgs } from "./server/route.js"
import { redirect } from "./server/utils.js"

async function post({ req }: RoutePostArgs) {
    let updated = await get("updated") ?? new Map
    const keys : [string, number][] = Array.from(updated)
    const items = await getMany(keys.map(x => x[0]))
    const data : PostData[] = new Array(updated.size)
    for (let index = 0; index < items.length; index++) {
        let [key, rev] = keys[index]
        data[index] = { key, data: items[index], rev }
    }
    const lastSyncedId = (await get("settings"))?.lastSyncedId ?? 0

    let newData : {lastSyncedId: number, data: [string, any][], saved: [string, number][]}
    const res = await fetch("/api/data", {
        method: "POST",
        body: JSON.stringify({ lastSyncedId, data }),
        headers: {
            "Content-Type": "application/json"
        }
    })
    if (res.status >= 200 && res.status <= 299 && res.headers.get("Content-Type")?.startsWith("application/json")) {
        newData = await res.json()
    } else if (res.status === 401 || res.redirected) {
        try {
            let url = new URL(res.url)
            url.searchParams.append("returnUrl", req.url)
            return Response.redirect(url.href, 303)
        } catch (error) {
            console.error({ error, message: "Could not contact back end.", res })
            return reject("Could not sync. Are you online?")
        }
    } else {
        console.error("/api/data", { error: res.statusText, message: "Could not sync data!" })
        return reject("Oops! Something happened and could not sync the data!")
    }

    await setMany(newData.data)
    let updatedData = await getMany<any>(newData.saved.map(x => x[0]))
    let updatedRevisionsTask = []
    for (let index = 0; index < updatedData.length; index++) {
        let d = updatedData[index]
        let [key, revision] = newData.saved[index]
        d._rev = revision
        updatedRevisionsTask.push(set(key, updatedData[index], false))
    }

    await Promise.all([
        ...updatedRevisionsTask,
        update("settings", val => ({ ...val, lastSyncedId: newData.lastSyncedId }), { sync: false }),
        update("updated", (val: Updated) => (val?.clear(), val), { sync: false })])
    return redirect(req)
}

interface PostData {
    key: string
    data: any
    rev: number
}

let route : Route = {
    route: /\/sync\/$/,
    post,
    get: async () => {
        const count = (await get("updated"))?.size ?? 0
        return html`Sync&nbsp;-&nbsp;${""+count}`
    }
}

export default route
