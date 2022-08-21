import { cache } from "./db"
import { HTMLReturnType } from "./html-template-tag"
import { reject } from "./repo"
import { redirect, searchParams } from "./utils"

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

interface RoutePostArgsWithQuery extends RoutePostArgs {
    query: any
}

export type PostHandlers = Record<string, (o: RoutePostArgsWithQuery) => Promise<any>>
export function handlePost(handlers: PostHandlers) {
    return async (args: RoutePostArgs) => {
        let query = searchParams<{handler?: string}>(args.req)
        let extendedArgs = { ...args, query }
        let resultTask = query.handler && handlers[query.handler]
            ? handlers[query.handler](extendedArgs)
        : handlers["post"]
            ? handlers["post"](extendedArgs)
        : reject("I'm sorry, I didn't understand where to route your request.")

        let result = await resultTask
        if (result instanceof Promise) {
            await result.catch(x => cache.push(x))
        }

        return !(result instanceof Response)
                ? redirect(args.req)
            : result
    }
}

interface RouteGet {
    (req: Request): Promise<HTMLReturnType>
}

export interface RoutePostArgsWithType<TData, TQuery = any> {
    data: TData
    req: Request
    query: TQuery
}

export interface RoutePostArgs {
    data: any
    req: Request 
}
export interface RoutePost {
    (options: RoutePostArgs): Promise<HTMLReturnType>|Promise<Response>
}
export interface Route {
    route: RegExp | ((a: URL) => boolean)
    get?: RouteGet
    post?: RoutePost
}
