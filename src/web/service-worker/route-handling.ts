import { findRoute, handleGet, handlePost, PostHandlers, RouteGet, RouteGetHandler, RoutePost } from "../server/route.js"
import { version } from "../server/settings.js"
import { options } from "../server/route.js"
import { redirect, reject, searchParams } from "../server/utils.js"
import links from "../entry-points.js"
import { isHtml } from "html-template-tag-stream"

options.searchParams = searchParams
options.reject = reject
options.redirect = (req: Request) => Response.redirect(req.referrer, 303)

export let errors : string[] = []
export let messages : string[] = []

export async function getResponse(event: FetchEvent): Promise<Response>  {
    try {
        const req : Request = event.request
        const url = normalizeUrl(req.url)
        return (
            url.pathname.endsWith("sw.js") || !url.pathname.startsWith("/web/")
                ? fetch(req)
            : req.method === "POST"
                ? post(url, req)
            : get(url, req, event))
    } catch(error) {
        console.error("Get Response Error", error)
        return new Response("Oops something happened which shouldn't have!")
    }
}

async function get(url: URL, req: Request, event: FetchEvent) : Promise<Response> {
    if (!url.pathname.endsWith("/")) return cacheResponse(url.pathname, event)
    let handler =
        <RouteGet | RouteGetHandler | undefined>
        findRoute(url, req.method.toLowerCase())
    let result : any = handleGet(handler, req)
    if (result) {
        if (result instanceof Promise) {
            result = await result
            .catch(async (error: any) => {
                console.error("GET page error:", error, "\nURL:", url.toString())
                return new Response("Oops! Something happened which shouldn't have!")
            })
        }

        if (result instanceof Response) {
            return result
        } else {
            return streamResponse({ body: result, headers: {}})
        }
    }
    return new Response("Not Found!")
}

function htmfHeader(req: Request, headers : any = {}) {
    if (!req.headers.has("HF-Request")) return headers
    headers["hf-events"] = JSON.stringify({
        "user-messages": messages,
        ...(headers["hf-events"] || {})
    })
    messages = []
    return headers
}

async function post(url: URL, req: Request) : Promise<Response> {
    let handler =
        <RoutePost | PostHandlers |null>
        findRoute(url, req.method.toLowerCase())
    // @ts-ignore
    if (handler) {
        try {
            const data = await getData(req)
            let result = await
                (handler instanceof Function
                    ? handler
                : handlePost(handler))({ req, data })

            if (result instanceof Response) {
                return result
            }

            if ("message" in result) {
                if (result.message.length > 0) {
                    messages.push(result.message)
                }
            } else {
                messages.push("Saved!")
            }
            if ("status" in result) {
                let headers = result.headers || {}
                result.headers = htmfHeader(req, headers)
                if (isHtml(result.body)) {
                    result = streamResponse(result)
                } else {
                    result = new Response(result.body, {
                        status: result.status,
                        headers: result.headers
                    })
                }
            }
            if ("response" in result) {
                result = result.response
            }
            if (isHtml(result)) {
                result = {
                    body: result,
                    headers: htmfHeader(req)
                }
                result = streamResponse(result)
            }
            if (result instanceof Response) {
                return result
            }
            return redirect(req)
        } catch (error) {
            console.error("Post error:", error, "\nURL:", url);
            errors.push(error?.toString() ?? "Unknown error!")
            return redirect(req)
        }
    }
    errors.push(`Unknown POST request "${url.pathname}"!`)
    return redirect(req)
}

async function getData(req: Request) {
    let o : any = {}
    if (req.headers.get("content-type")?.includes("application/x-www-form-urlencoded")) {
        const formData = await req.formData()
        for (let [key, val] of formData.entries()) {
            if (key.endsWith("[]")) {
                key = key.slice(0, -2)
                if (key in o) {
                    o[key].push(val)
                } else {
                    o[key] = [val]
                }
            } else {
                o[key] = val
            }
        }
    } else if (req.headers.get("Content-Type")?.includes("json")) {
        o = await req.json()
    }
    return o
}

async function cacheResponse(url: string, event: { request: string | Request } | undefined) : Promise<Response> {
    url = links.find(x => x.url === url)?.file || url
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
function streamResponse(response: { body: Generator, headers?: any }) : Response {
    let { body, headers } = response
    const stream = new ReadableStream({
        async start(controller : ReadableStreamDefaultController<any>) {
            for await (let x of body) {
                if (typeof x === "string")
                    controller.enqueue(encoder.encode(x))
            }
            controller.close()
        }
    })

    return new Response(stream, {
        headers: {
            "content-type": "text/html; charset=utf-8",
            ...headers,
        }})
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

