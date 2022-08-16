import html from "../js/html-template-tag.js"
import layout from "../_layout.html.js"
import * as db from "../js/db.js"
import { Settings } from "../js/db.js"
import { RoutePostArgs } from "../js/route.js"
import { isSelected } from "../js/utils.js"

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

async function get(req: Request) {
    let [settings, template] = await Promise.all([start(), layout(req)])
    return template({ main: render(settings) })
}

const handler = <any>{
    settings: handleSetting,
}

export default {
    route: /\/user-settings\/edit\/$/,
    get,
    async post({data, req}: RoutePostArgs) {
        let handlerType = new URL(req.url).searchParams.get("handler")
        let handle
        if (handlerType && (handle = handler[<any>handlerType])) {
            await handle(data)
        }
        return Response.redirect(req.referrer, 303)
    }
}
