import type { RoutePostHandler, RoutePage } from "@jon49/sw/routes.middleware.js"
import type { Theme } from "../server/db.js"

const {
    globalDb: db,
    html,
} = self.app

function getTheme(x: unknown): Theme {
    return x === "light"
        ? "light"
    : x === "dark"
        ? "dark"
    : "light"
}

const postHandlers : RoutePostHandler = {
    async theme({ req }) {
        let { theme } = await db.settings()
        theme =
            theme === "light"
                ? "dark"
            : theme === "dark"
                ? null
            : "light"

        await db.setTheme(theme)

        if (req.headers.get("hf-request") === "true") {
            return {
                status: 302,
                headers: { Location: req.referrer }
            }
        }

        return null
    },

    async defaultTheme({ data }) {
        let settings = await db.settings()
        settings.defaultTheme = getTheme(data.defaultTheme) || "light"
        await db.setSettings(settings)
        return html``
    }
}

const route : RoutePage = {
    post: postHandlers
}

export default route

