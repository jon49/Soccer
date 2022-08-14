import { HTMLReturnType } from "./html-template-tag"
import { searchParams } from "./utils"

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

export function findRoute(route: string, method: unknown) {
    let validMethod : MethodTypes = isMethod(method)
    if (validMethod) {
        for (const r of routes) {
            if (r[validMethod] && r.route.test(route)) {
                return r[validMethod]
            }
        }
    }
    return null
}

export type PostHandlers = Record<string, (o: RoutePostArgs) => Promise<void>>
export async function handlePost(args: RoutePostArgs, handlers: PostHandlers) {
    let query = searchParams<{handler?: string}>(args.req)
    return query.handler && handlers[query.handler]
        ? handlers[query.handler](args)
    : handlers["post"]
        ? handlers["post"](args)
    : Promise.reject("I'm sorry, I didn't understand where to route your request.")
}

interface RouteGet {
    (req: Request): Promise<HTMLReturnType>
}

export interface RoutePostArgsWithType<T> {
    data: T
    req: Request 
}

export interface RoutePostArgs {
    data: any
    req: Request 
}
export interface RoutePost {
    (options: RoutePostArgs): Promise<HTMLReturnType>|Promise<Response>
}
export interface Route {
    route: RegExp
    get?: RouteGet
    post?: RoutePost
}
