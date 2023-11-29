import type html from "./html.js"
import { reject } from "./repo.js"
import { redirect, searchParams } from "./utils.js"
type HTMLReturnType = ReturnType<typeof html>

let routes : Route[] = []

export function addRoutes(routesList: Route[]) {
    routes = routesList
}

export type AddRoutes = typeof addRoutes

const methodTypes = ['get', 'post'] as const
type MethodTypes = typeof methodTypes[number] | null

function isMethod(method: unknown) {
    if (typeof method === "string" && methodTypes.includes(<any>method)) {
        return method as MethodTypes
    }
    return null
}

export function findRoute(url: URL, method: unknown) {
    let validMethod : MethodTypes = isMethod(method)
    if (validMethod) {
        for (const r of routes) {
            if (r[validMethod]
                && (r.route instanceof RegExp && r.route.test(url.pathname)
                    || (r.route instanceof Function && r.route(url)))) {
                return r[validMethod]
            }
        }
    }
    return null
}

function call(fn: Function | undefined, args: any) {
    return fn instanceof Function && fn(args)
}

export type PostHandlers = Record<string, (o: RoutePostArgs) => Promise<any>>
export async function handlePost(handlers: PostHandlers, args: RoutePostArgs) {
    let query = searchParams<{handler?: string}>(args.req)
    let extendedArgs = { ...args, query }
    let result =
        await (call(handlers[query.handler ?? ""], extendedArgs)
        || call(handlers["post"], extendedArgs)
        || reject("I'm sorry, I didn't understand where to route your request."))

    return result === undefined
            ? redirect(args.req)
        : result
}

export function handleGet(handlers: RouteGetHandler | RouteGet | undefined, req: Request) {
    if (handlers == null) return
    let query = searchParams<{handler?: string}>(req)
    let extendedArgs = { req, query }
    if (handlers instanceof Function) {
        return handlers(extendedArgs)
    }
    let resultTask =
        query.handler && handlers[query.handler]
            ? handlers[query.handler](extendedArgs)
        : handlers["get"]
            ? handlers["get"](extendedArgs)
        : reject("I'm sorry, I couldn't find that page.")
    return resultTask
}

export interface RouteGetArgs {
    req: Request
    query: any
}

export interface RouteGet {
    (request: RouteGetArgs): Promise<HTMLReturnType> | HTMLReturnType | Promise<Response>
}

export interface RouteGetHandler {
    [handler: string]: RouteGet
}

export interface RoutePostArgs {
    query: any
    data: any
    req: Request 
}
export interface RoutePost {
    (options: RoutePostArgs): Promise<HTMLReturnType> | Promise<Response>
}
export interface Route {
    route: RegExp | ((a: URL) => boolean)
    get?: RouteGet | RouteGetHandler
    post?: RoutePost | PostHandlers
}

