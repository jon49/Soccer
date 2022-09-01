import { addRoutes, findRoute, RoutePost } from "./js/route"
import indexHandler from "./index.html.js"
import { version } from "./settings"
import teamsHandler from "./teams.html"
import playersHandler from "./players.html"
import gamesHandler from "./games.html"
import gamesPlayHandler from "./games/game-play.html"
import playersEditHandler from "./players/edit.html"
import { cache } from "./js/db"
import { messageView } from "./js/shared"
import html from "./js/html-template-tag"
import { redirect } from "./js/utils"

addRoutes([
    indexHandler,
    teamsHandler,
    playersHandler,
    playersEditHandler,
    gamesPlayHandler,
    gamesHandler,
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
        if (url.pathname.endsWith("sw.js") || !url.pathname.startsWith("/web/")) return fetch(req)
        if (req.method === "POST") return post(url, req)
        return get(url, req, event)
    } catch(error) {
        console.error("Get Response Error", error)
        return new Response("Oops something happened which shouldn't have!")
    }
}

async function get(url: URL, req: Request, event: FetchEvent) : Promise<Response> {
    if (!url.pathname.endsWith("/")) return cacheResponse(url.pathname, event)
    let handler = <(req: Request) => Promise<Generator<any, void, unknown>>|null>findRoute(url, req.method.toLowerCase())
    if (handler) {
        let result =
            await handler(req)
            ?.catch(async () => {
                let message = await cache.pop("message")
                let view = messageView(message)
                if (view) {
                    return streamResponse(url.pathname, html`<div>${view}</div>`)
                }
                return new Response("Oops! Something happened which shouldn't have!")
            })

        if (result instanceof Response) {
            return result
        } else if (result) {
            return streamResponse(url.pathname, result)
        }
    }
    return new Response("Not Found!")
}

async function post(url: URL, req: Request) : Promise<Response> {
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
                return streamResponse(url.pathname, result)
            }
            // return new Response("<meta http-equiv='refresh' content='0'>", { headers: htmlHeader()})
        } catch (error) {
            let message = await cache.peek("message")
            if (!error && message) {
                if (req.headers.has("hf-request")) {
                    message = await cache.pop("message")
                    return new Response(null, { headers: { ...htmlHeader(), "hf-events": JSON.stringify({ "s:error": { message } }) } })
                }
                return redirect(req)
            } else {
                console.error("Unknown error during post.", error)
                return new Response(`Unknown error "${JSON.stringify(error)}".`)
            }
        }
    }
    return new Response("Not Found!")
}

async function getData(req: Request) {
    let o : any = {}
    if (req.headers.get("content-type")?.includes("application/x-www-form-urlencoded")) {
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
function streamResponse(url: string, generator: Generator | { body: Generator, headers?: any }) : Response {
    console.log(`Loading ${url}`)
    let { body, headers } = "body" in generator ? generator : { body: generator, headers: {} }
    const stream = new ReadableStream({
        start(controller : ReadableStreamDefaultController<any>) {
            for (let x of body) {
                if (typeof x === "string")
                    controller.enqueue(encoder.encode(x))
            }
            controller.close()
        }
    })

    return new Response(stream, { headers: { ...htmlHeader(), ...headers }})
}

/**
*  /my/url -> /my/url/
*  /my/script.js -> /my/script.js
*/
function normalizeUrl(url: string) : URL {
    let uri = new URL(url)
    let path = uri.pathname
    !uri.pathname.endsWith("/") && (uri.pathname = isFile(path) ? path : path+"/")
    return uri
}

function isFile(s: string) {
    return s.lastIndexOf("/") < s.lastIndexOf(".")
}

function htmlHeader() {
    return { "content-type": "text/html; charset=utf-8" }
}
