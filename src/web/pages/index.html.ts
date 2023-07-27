import html from "../server/html.js"
import { Route } from "../server/route.js"
import layout from "./_layout.html.js"

const route : Route = {
    route: /\/web\/?$/,
    get: async (req: Request) => {
        return layout(req, { main: html`<p>Welcome to the soccer app!</p>` })
    }
}

export default route

