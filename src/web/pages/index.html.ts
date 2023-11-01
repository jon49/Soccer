import html from "../server/html.js"
import { Route } from "../server/route.js"
import { searchParams } from "../server/utils.js"
import layout from "./_layout.html.js"
import db from "../server/global-model.js"

let index : Route = {
    route: /\/web\/$/,
    get: async (req: Request) => {
        let params = searchParams<{ login?: string, loggedOut?: string }>(req)
        if (params.login === "success") {
            await db.setLoggedIn(true)
        }
        if (params.loggedOut === "true") {
            await db.setLoggedIn(false)
        }
        return layout(req, {
            main: html`<p>Welcome to drive tracking!</p>`,
            title: "Home" })
    }
}

export default index

