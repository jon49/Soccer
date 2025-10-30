import type { RoutePage } from "@jon49/sw/routes.middleware.js"

const {
    html,
    layout,
} = self.sw

let index : RoutePage = {
    get: async () => {
        return layout({
            main: html`<p>Welcome to soccer tracking!</p><i traits=redirect data-url="/web/teams"></i>`,
            title: "Home" })
    }
}

export default index

