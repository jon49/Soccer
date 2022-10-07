import html from "./server/html-template-tag.js"
import { cache, get, Message } from "./server/db.js"
import { version } from "./settings.js"
import { messageView, when } from "./server/shared.js"
import { Theme } from "./user-settings/edit.html.js"

interface Nav {
    name: string
    url: string
}

interface Render {
    theme: Theme | undefined
    error: Message
    syncCount: number
    referrer: URL | null
}

const render = ({theme, error, syncCount, referrer}: Render) => (o: LayoutTemplateArguments) => {
    const { main, head, scripts, nav, reload } = o
    referrer?.searchParams.set("handler", "reload")
    return html`
<!DOCTYPE html>
<html>
 <head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Soccer</title>
    <link href="/web/css/site.v3.css" rel=stylesheet>
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
                    onclick="this.form.requestSubmit()">
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
            <form id=sync-form class=inline method=POST action="/web/sync/">
                <button id=sync-count>Sync&nbsp;-&nbsp;${""+syncCount}</button>
                <input type=hidden name=state>
            </form>
            <form id=update-sync-count action="/web/sync/" hidden target=#sync-count></form>
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
    ${reload && referrer && html`<form id=reload-form action="${referrer.toString()}" target="${reload.target}" hidden></form>`}
    <footer><p>${version}</p></footer>
    <div id=messages></div>
    <script src="/web/js/lib/request-submit.js"></script>
    <script src="/web/js/lib/htmf.v0.9.js"></script>
    ${(scripts ?? []).map(x => html`<script src="${x}"></script>`)}
    <script src="/web/js/snack-bar.js"></script>
    <script src="/web/js/main.v8.js"></script>
</body>
</html>`
}

const getSyncCount = async () => (await get("updated"))?.size ?? 0

export default
    async function layout(req: Request) {
        let referrer = req.referrer ? new URL(req.referrer) : null
        let [theme, syncCount, error] = await Promise.all([get("settings"), getSyncCount(), cache.pop("message")])
        return render({ theme: theme?.theme, error, syncCount, referrer })
    }

export type Layout = typeof layout

export interface LayoutTemplateArguments {
    head?: string
    main?: Generator|string
    scripts?: string[]
    nav?: Nav[]
    reload?: {
        target: string
    }
}
