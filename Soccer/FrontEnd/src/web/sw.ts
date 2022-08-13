import { addRoutes, findRoute, RoutePost } from "./js/route"
import indexHandler from "./index.html.js"
import { version } from "./settings"
import layout from "./_layout.html"
import teamsHandler from "./teams.html"
import { set } from "./js/db"
import html from "./js/html-template-tag"

addRoutes([
    indexHandler,
    teamsHandler,
])

const links : string[] = [] // File cache

self.addEventListener('message', event => {
    if (event.data.action === 'skipWaiting') {
        console.log("Skip waiting!")
        // @ts-ignore
        return self.skipWaiting()
    }
});

self.addEventListener("install", (e: Event): void => {
    console.log(`Installing version '${version}' service worker.`)
    // @ts-ignore
    e.waitUntil(
        caches.open(version)
        .then((cache: any) => cache.addAll(links)))
        ?.catch((x: any) => console.error(x))
})

// @ts-ignore
self.addEventListener("fetch", (e: FetchEvent) => e.respondWith(getResponse(e)))

// @ts-ignore
self.addEventListener("activate", async (e: ExtendableEvent) => {
    console.log(`Service worker activated. Cache version '${version}'.`)
    const keys = await caches.keys()
    // @ts-ignore
    if (e.waitUntil) {
        let cacheDeletes =
                keys
                .map((x: string) => ((version !== x) && caches.delete(x)))
                // @ts-ignore
                .filter(x => x)
        if (cacheDeletes.length === 0) return
        // @ts-ignore
        e.waitUntil(Promise.all(cacheDeletes))?.catch((x: any) => console.error(x))
    }
})

async function getResponse(event: FetchEvent): Promise<Response>  {
    try {
        const req : Request = event.request
        const url = normalizeUrl(req.url)
        if (url.endsWith("sw.js") || !url.startsWith("/web/")) return fetch(req)
        if (req.method === "POST") return post(url, req)
        return get(url, req, event)
    } catch(error) {
        console.error("Get Response Error", error)
        return new Response("Oops something happened which shouldn't have!")
    }
}

async function get(url: string, req: Request, event: FetchEvent) : Promise<Response> {
    if (!url.endsWith("/") || isFile(url)) return cacheResponse(url, event)
    let handler = <(req: Request) => Promise<Generator<any, void, unknown>>|null>findRoute(url, req.method.toLowerCase())
    if (handler) {
        let result = await handler(req)
        if (result) {
            return streamResponse(url, result)
        }
    }
    return new Response("Not Found!")
}

async function post(url: string, req: Request) : Promise<Response> {
    let handler = <RoutePost|null>findRoute(url, req.method.toLowerCase())
    // @ts-ignore
    if (handler) {
        try {
            const data = await getData(req)
            let result = await handler({ req, data })
            if (result instanceof Response) {
                return result
            }
            if (result) {
                return streamResponse(url, result)
            }
            // return new Response("<meta http-equiv='refresh' content='0'>", { headers: htmlHeader()})
        } catch (error) {
            if (error && typeof error === "object" && error.hasOwnProperty("message")) {
                await set("error", error, false)
                return Response.redirect(req.referrer, 302)
            } else {
                console.error("Unknown error during post.", error)
            }
        }
    }
    return new Response("Not Found!")
}

async function getData(req: Request) {
    let o : any = {}
    if (req.headers.get("content-type") === "application/x-www-form-urlencoded") {
        const formData = await req.formData()
        formData.forEach((val, key) => o[key] = val)
    } else if (req.headers.get("Content-Type")?.includes("json")) {
        o = await req.json()
    }
    return o
}

async function cacheResponse(url: string, event: { request: string | Request } | undefined) : Promise<Response> {
    const match = await caches.match(url)
    if (match) return match
    const res = await fetch(event?.request || url)
    if (!res || res.status !== 200 || res.type !== "basic") return res
    const responseToCache = res.clone()
    const cache = await caches.open(version)
    cache.put(url, responseToCache)
    return res
}

const encoder = new TextEncoder()
function streamResponse(url: string, gen: Generator) : Response {
    console.log(`Loading ${url}`)
    const stream = new ReadableStream({
        start(controller : ReadableStreamDefaultController<any>) {
            for (let x of gen) {
                if (typeof x === "string")
                    controller.enqueue(encoder.encode(x))
            }
            controller.close()
        }
    })

    return new Response(stream, { headers: htmlHeader()})
}

/**
*  /my/url -> /my/url/
*  /my/script.js -> /my/script.js
*/
function normalizeUrl(url: string) : string {
    let path = new URL(url).pathname
    !path.endsWith("/") && (path = isFile(path) ? path : path+"/")
    return path
}

function isFile(s: string) {
    return s.lastIndexOf("/") < s.lastIndexOf(".")
}

function htmlHeader() {
    return { "content-type": "text/html; charset=utf-8" }
}
