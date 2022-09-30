import html from "../server/html-template-tag.js"
import layout from "../_layout.html.js"
import * as db from "../server/db.js"
import { Settings } from "../server/db.js"
import { handlePost, PostHandlers, Route, RoutePostArgs } from "../server/route.js"
import { isSelected, redirect } from "../server/utils.js"
import { createCheckbox, validateObject } from "../server/validation.js"

const themes = ["dark", "light", "none"] as const
export type Theme = typeof themes[number]

const start = async () => {
    let settings = await db.get("settings")
    settings = settings ?? <Settings>{}
    return { theme: getTheme(settings.theme) }
}

const render = (o: { theme: Theme }) => {
    const selected = isSelected<Theme>(o.theme)
    const option = (value: Theme, display: string) => html`<option value="${value}" ${selected(value)}>${display}</option>`
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

function handleSetting(data: Settings) {
    return db.update("settings", x => {
        let theme = { theme: getTheme(data.theme) }
        if (!x) {
            return theme
        }
        return { ...x, ...theme }
    }, { sync: false })
}

function getTheme(s: unknown) {
    return themes.find(x => x === s) ?? "none"
}

async function get() {
    let [settings, template] = await Promise.all([start(), layout()])
    return template({ main: render(settings) })
}

// const handler = <any>{
//     settings: handleSetting,
// }

const dataValidator = {
    light: createCheckbox
}

const postHandlers : PostHandlers = {
    updateTheme: async ({ data, req }) => {
        let { light } = await validateObject(data, dataValidator)
        let theme : Theme = light ? "light" : "dark"
        await db.set("settings", { theme }, false)
        if (req.headers.has("hf-request")) {
            return new Response(null, { status: 204, headers: { "hf-events": JSON.stringify({ themeUpdated: { theme } }) } })
        } else {
            return
        }
    },
}

const route : Route = {
    route: /\/user-settings\/edit\/$/,
    get,
    post: handlePost(postHandlers)
}

export default route
