import type { RoutePostHandler, RoutePage } from "@jon49/sw/routes.middleware.js"

const {
    globalDb: db,
} = self.app

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
    }
}

const route : RoutePage = {
    post: postHandlers
}

export default route

