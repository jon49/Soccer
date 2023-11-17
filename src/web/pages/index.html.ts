import html from "../server/html.js"
import { Route } from "../server/route.js"
import layout from "./_layout.html.js"
import db from "../server/global-model.js"

let index : Route = {
    route: /\/web\/$/,
    get: async ({ query }) => {
        if (query.login === "success") {
            await db.setLoggedIn(true)
        }
        if (query.loggedOut === "true") {
            await db.setLoggedIn(false)
        }
        return layout({
            main: html`<p>Welcome to soccer tracking!</p>`,
            title: "Home" })
    }
}

export default index

