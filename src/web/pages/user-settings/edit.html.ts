import html from "../../server/html.js"
import layout from "../_layout.html.js"
import * as db from "../../server/db.js"
import { Settings } from "../../server/db.js"
import { PostHandlers, Route } from "../../server/route.js"
import { isSelected } from "../../server/utils.js"
import { createCheckbox, validateObject } from "../../server/validation.js"


const start = async () => {
    let settings = await db.get("settings")
    settings = settings ?? <Settings>{}
    return { theme: getTheme(settings.theme) }
}

const render = (o: { theme: db.Theme }) => {
    const selected = isSelected<db.Theme>(o.theme)
    const option = (value: db.Theme, display: string) => html`<option value="${value}" ${selected(value)}>${display}</option>`
    return html`
<h2>User Settings</h2>
<p id=message></p>
<form method=POST action="?handler=settings" onchange="this.submit()">
    <label>Theme:<br>
        <select name=theme required>
            ${option("dark", "Dark")}
            ${option("light", "Light")}
            ${option("none", "Default")}
        </select>
    </label>
</form>`
}

function getTheme(s: unknown) {
    return db.themes.find(x => x === s) ?? "none"
}

async function get(req: Request) {
    let settings = await start()
    return layout(req, {
        main: render(settings),
        title: "User Settings"
    })
}

const dataValidator = {
    light: createCheckbox
}

const postHandlers : PostHandlers = {
    updateTheme: async ({ data }) => {
        let { light } = await validateObject(data, dataValidator)
        let theme : Theme = light ? "light" : "dark"
        await db.set("settings", { theme }, false)
    },
}

const route : Route = {
    route: /\/user-settings\/edit\/$/,
    get,
    post: postHandlers
}

export default route
