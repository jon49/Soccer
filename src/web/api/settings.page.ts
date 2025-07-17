import { RoutePostHandler, RoutePage } from "@jon49/sw/routes.middleware.js"

const {
    db: { settings, setTheme },
    views: { themeView },
} = self.app

const postHandlers : RoutePostHandler = {
    async theme({ req }) {
        let { theme } = await settings()
        theme =
            theme === "light"
                ? "dark"
            : theme === "dark"
                ? null
            : "light"

        await setTheme(theme)

        if (req.headers.get("hf-request") === "true") {
            return {
                status: 200,
                body: themeView(theme),
                events: { "app-theme": { theme } }
            }
        }

        return null
    }
}

const route : RoutePage = {
    post: postHandlers
}

export default route

