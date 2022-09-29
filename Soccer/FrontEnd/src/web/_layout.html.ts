import html from "./server/html-template-tag.js"
import { cache, get, Message } from "./server/db.js"
import { version } from "./settings.js"
import { messageView, when } from "./server/shared.js"

interface Nav {
    name: string
    url: string
}

interface Render {
    theme: string | undefined
    error: Message
    syncCount: number
}

const render = ({theme, error, syncCount}: Render) => (o: LayoutTemplateArguments) => {
    const { main, head, scripts, nav } = o
    return html`
<!DOCTYPE html>
<html>
 <head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Soccer</title>
    <link href="/web/css/site.v2.css" rel=stylesheet>
    $${head}
</head>
<body $${when(theme, x => html`class=${x}`)}>
    <a href="/login?handler=logout" style="position: absolute; top: 10px; right: 10px;">Logout</a>
    <header>
        <div class=sync>
            <h1 class=inline>Soccer</h1>
            <form id=sync-form class=inline method=POST action="/web/sync/">
                <button id=sync-count>Sync&nbsp;-&nbsp;${""+syncCount}</button>
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
    <footer><p>${version}</p></footer>
    <div id=messages></div>
    ${(scripts ?? []).map(x => html`<script src="${x}" type=module></script>`)}
    <script src="/web/js/snack-bar.js"></script>
    <script src="/web/js/main.v3.js"></script>
</body>
</html>`
}

const getSyncCount = async () => (await get("updated"))?.size ?? 0

export default
    async function layout() {
        let [theme, syncCount, error] = await Promise.all([get("settings"), getSyncCount(), cache.pop("message")])
        return render({ theme: theme?.theme, error, syncCount })
    }

export type Layout = typeof layout

export interface LayoutTemplateArguments {
    head?: string
    main?: Generator|string
    scripts?: string[]
    nav?: Nav[]
}
