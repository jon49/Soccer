import { RoutePage } from "@jon49/sw/routes.js"

const {
    db: { setLoggedIn },
    html,
    layout,
} = self.app

let index : RoutePage = {
    get: async ({ query }) => {
        if (query.login === "success") {
            await setLoggedIn(true)
        }
        if (query.loggedOut === "true") {
            await setLoggedIn(false)
        }
        return layout({
            main: html`<p>Welcome to soccer tracking!</p>`,
            title: "Home" })
    }
}

export default index

