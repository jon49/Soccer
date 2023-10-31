import { PostHandlers, Route } from "../server/route.js"
import sync from "../server/sync.js"

const postHandlers : PostHandlers = {
    async post() {
        let result = await sync()
        switch (result.status) {
            case 200:
                return {
                    status: 302
                }
            case 204:
                return {
                    message: "Synced!",
                    status: 204
                }
            case 401:
                return {
                    status: 401,
                    message: "You are not logged in!" }
            case 403:
                return {
                    status: 403,
                    message: "" }
            default:
                return {
                    status: 500,
                    message: "Unknown error!"
            }
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
                    status: 204
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

const router: Route = {
    route: /\/api\/sync\/$/,
    post: postHandlers
}

export default router

