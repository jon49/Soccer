import { PostHandlers, Route } from "../server/route.js"
import sync from "../server/sync.js"

const postHandlers : PostHandlers = {
    async post() {
        await sync()
        return {
            message: "",
            response: new Response("OK")
        }
    },
    async force() {
        await sync()
        return {
            message: "Synced!",
            response: null
        }
    }
}

const router: Route = {
    route: /\/api\/sync\/$/,
    post: postHandlers
}

export default router

