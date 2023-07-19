import html from "./server/html-template-tag.js"
import layout from "./_layout.html.js"

export default {
    route: /\/web\/?$/,
    get: async (req: Request) => {
        let template = await layout(req)
        return template({ main: html`<p>Welcome to the soccer app!</p>` })
    }
}
