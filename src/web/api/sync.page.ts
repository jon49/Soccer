import type { RoutePostHandler, RoutePage } from "@jon49/sw/routes.js"
import sync from "../server/sync.js"

const {
    db: { updated },
    views: { syncCountView },
} = self.app

const postHandlers : RoutePostHandler = {
    async post() {
        let result = await sync()
        switch (result.status) {
            case 200:
                return {
                    status: 302
                }
            default:
                return { status: 204, message: "" }
        }
    },
    async force() {
        let result = await sync()
        switch (result.status) {
            case 200:
                return {
                    status: 302
                }
            case 204:
                return {
                    message: "Synced!",
                    response: null
                }
            case 401:
            case 403:
                return {
                    status: 401,
                    message: "You are not logged in!" }
            default:
                return {
                    status: 500,
                    message: "Unknown error!"
            }
        }
    }
}

const router: RoutePage = {
    get: async () => {
        let x = await updated()
        return syncCountView(x.length)
    },
    post: postHandlers
}

export default router

