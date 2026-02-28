import type { RoutePage } from "@jon49/sw/routes.middleware.js"

const {
    html,
    layout,
} = self.app

let index : RoutePage = {
    get: async () => {
        return layout({
            main: html`<p>Welcome to soccer tracking!</p><i _load=redirect data-url="/web/teams"></i>`,
            title: "Home" })
    }
}

export default index

