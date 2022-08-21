import { Route } from "../js/route"
import layout from "../_layout.html"

const route : Route = {
    route: (url: URL) => url.pathname.endsWith("/games/") && url.searchParams.has("game") && url.searchParams.has("team"),
    async get(req: Request) {
        const template = await layout(req)
        return template({ script: "/web/js/lib/htmf-all.min.js" })
        // const result = await start(req)
        // const template = await layout(req)
        // return template({ main: render(result) })
    },
    // post: handlePost(postHandlers),
}

export default route
