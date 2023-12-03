import { findRoute, handleGet, handlePost, PostHandlers, RouteGet, RouteGetHandler, RoutePost } from "../server/route.js"
import { version } from "../server/settings.js"
import { redirect, searchParams } from "../server/utils.js"
import links from "../entry-points.js"
import { ValidationResult } from "promise-validation"

// Test if value is Async Generator
let isHtml = (value: any) =>
    value?.next instanceof Function
    && value.throw instanceof Function

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

function isHtmf(req: Request) {
    return req.headers.has("HF-Request")
}

function htmfHeader(req: Request, events: any = {}, messages: string[] = [])
    : Record<string, string> {
    if (!isHtmf(req)) return {}
    return {
        "hf-events": JSON.stringify({
        "user-messages": messages ?? [],
        ...(events || {})
    }) ?? "{}" }
}

async function post(url: URL, req: Request) : Promise<Response> {
    let handler =
        <RoutePost | PostHandlers | null>
        findRoute(url, req.method.toLowerCase())
    // @ts-ignore
    if (handler) {
        try {
            let messages: string[] = []
            const data = await getData(req)
            let args = { req, data, query: searchParams(req) }
            let result = await (
                handler instanceof Function
                    ? handler(args)
                : handlePost(handler, args))

            if (!result) {
                return redirect(req)
            }

            if (result.message == null) {
                messages.push("Saved!")
            }

            if (isHtml(result)) {
                return streamResponse({
                    body: result,
                    headers: htmfHeader(req, null, messages)
                })
            }

            if (result.message?.length > 0) {
                messages.push(result.message)
            } else if (result.messages?.length > 0) {
                messages.push(...result.messages)
            }

            result.headers = {
                ...htmfHeader(req, result.events, messages),
                ...result.headers
            }

            return isHtml(result.body)
                ? streamResponse(result)
            : new Response(result.body, {
                    status: result.status ?? 200,
                    headers: result.headers
                })

        } catch (error) {
            console.error("Post error:", error, "\nURL:", url);
            if (!isHtmf(req)) {
                return redirect(req)
            } else {
                let errors : string[] = []
                if (typeof error === "string") {
                    errors.push(error)
                }
                if (error instanceof ValidationResult) {
                    errors.push(...error.reasons.map(x => x.reason))
                }
                let headers = htmfHeader(req, {}, errors)
                return new Response(null, {
                    status: 400,
                    headers
                })
            }
        }
    }

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
            try {
                for await (let x of body) {
                    if (typeof x === "string")
                        controller.enqueue(encoder.encode(x))
                }
                controller.close()
            } catch (error) {
                console.error(error)
            }
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

