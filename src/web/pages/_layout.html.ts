import html from "../server/html.js"
import { cache, get, Message } from "../server/db.js"
import { version } from "../server/settings.js"
import { messageView, when } from "../server/shared.js"
import { Theme } from "./user-settings/edit.html.js"

interface Nav {
    name: string
    url: string
}

interface Render {
    theme: Theme | undefined
    error: Message
    referrer: URL | null
}

const render = ({theme, error}: Render, o: LayoutTemplateArguments) => {
    const { main, head, scripts, nav } = o
    return html`
<!DOCTYPE html>
<html>
 <head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Soccer</title>
    <link href="/web/css/index.css" rel=stylesheet>
    <link href="/web/css/app.css" rel=stylesheet>
    $${head}
</head>
<body $${when(theme, x => `class=${x}`)}>
    <div style="position: absolute; top: 10px; right: 10px;">
        <form method=post action="/web/user-settings/edit?handler=updateTheme" class=inline>
            <label class="toggle">
                <input
                    id=theme-input
                    name=light
                    type=checkbox
                    $${when(theme === "light", "checked")}
                    $${when(theme === "none" || theme == null, `indeterminate`)}
                    onclick="this.form.submit()">
                <span class="off button bg">&#127774;</span>
                <span class="on button bg">&#127762;</span>
                <span class="none button bg">⛅</span>
            </label>
        </form>
        <a href="/login?handler=logout">Logout</a>
    </div>
    <header>
        <div class=sync>
            <h1 class=inline>Soccer</h1>
        </div>
        <nav>
            <ul>
                <li><a href="/web/teams">Teams</a></li>
                ${ !nav || nav.length === 0
                    ? null
                : nav.map(x => html`<li><a href="$${x.url}">${x.name}</a></li>`) }
            </ul>
        </nav>
    </header>
    <main>
        ${messageView(error)}
        ${main}
    </main>
    <footer><p>${version}</p></footer>
    <div id=messages></div>
    <script src="/web/js/lib/mpa.min.js"></script>
    ${(scripts ?? []).map(x => html`<script src="${x}"></script>`)}
    <script src="/web/js/snack-bar.js"></script>
</body>
</html>`
}

export default
    async function layout(req: Request, o: LayoutTemplateArguments) {
        let referrer = req.referrer ? new URL(req.referrer) : null
        let [theme, error] = await Promise.all([get("settings"), cache.pop("message")])
        return render({ theme: theme?.theme, error, referrer }, o)
    }

export type Layout = typeof layout

export interface LayoutTemplateArguments {
    head?: string
    main?: AsyncGenerator<any, void, unknown>
    scripts?: string[]
    nav?: Nav[]
}
