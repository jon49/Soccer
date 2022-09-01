import { cache, TempCache } from "./db"

export async function reject(s: string | string[] | Partial<TempCache>) {
    if (typeof s === "string" || Array.isArray(s)) {
        let message =
            (await cache.peek("message") || [])
            .concat(s)
        await cache.push({ message })
    } else {
        if ("message" in s) {
            if (s.message) {
                await reject(s.message)
            }
            delete s.message
        }
        await cache.push(s)
    }
    return Promise.reject()
}
