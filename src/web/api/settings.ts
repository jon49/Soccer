import html from "html-template-tag-stream"
import { PostHandlers, Route } from "../server/route.js"
import db from "../server/global-model.js"
import { Theme } from "../server/db.js"

const defaultTheme = "⛅",
    lightTheme = "&#127774;",
    darkTheme = "&#127762;"

export function themeView(theme: Theme | undefined) {
    let image = theme === "light"
        ? lightTheme
    : theme === "dark"
        ? darkTheme
    : defaultTheme
    return html`<button class="bg">$${image}</button>`
}

const postHandlers : PostHandlers = {
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
                status: 200,
                body: themeView(theme),
                events: { "app-theme": { theme } }
            }
        }

        return null
    }
}

const route : Route = {
    route: /\/api\/settings\/$/,
    post: postHandlers
}

export default route

