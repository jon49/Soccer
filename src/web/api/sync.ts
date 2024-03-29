import html from "html-template-tag-stream"
import { PostHandlers, Route } from "@jon49/sw/routes.js"
import { when } from "../server/shared.js"
import sync from "../server/sync.js"
import db from "../server/global-model.js"

const postHandlers : PostHandlers = {
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

export function syncCountView(count: number) {
    return html`&#128259; ${when(count, count => html`(${count})`)}`
}

const router: Route = {
    route: /\/api\/sync\/$/,
    get: async () => {
        let updated = await db.updated()
        return syncCountView(updated.length)
    },
    post: postHandlers
}

export default router

