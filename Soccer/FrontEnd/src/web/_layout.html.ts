import html from "./js/html-template-tag.js"
import * as db from "./js/db.js"
import { version } from "./settings.js"

interface Nav {
    name: string
    url: string
}

interface Render {
    theme: string | undefined
    error: string[] | undefined
    syncCount: number
    url: string
}

const render = ({theme, error, syncCount, url}: Render) => (o: LayoutTemplateArguments) => {
    const { main, head, script, nav } = o
    return html`
<!DOCTYPE html>
<html>
 <head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Soccer</title>
    <link href="/web/css/site.css" rel=stylesheet>
    $${head}
</head>
<body ${theme ? html`class=${theme}` : null}>
    <a href="/login?handler=logout" style="position: absolute; top: 10px; right: 10px;">Logout</a>
    <header>
        <div class=sync>
            <h1 class=inline>Soccer</h1>
            <form class=inline method=POST action="/web/sync/">
                <input type=hidden name=url value="${url}">
                <button>Sync&nbsp;-&nbsp;${""+syncCount}</button>
            </form>
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
        ${error && error.map((x: string) => html`<p class=error>${x}</p>`)}
        ${main}
    </main>
    <footer><p>${version}</p></footer>
    <div id=messages></div>
    ${ script
         ? html`<script src="${script}" type=module></script>`
       : null }
    <script src="/web/js/snack-bar.js"></script>
    <script src="/web/js/service-worker-loader.js"></script>
</body>
</html>`
}

const getSyncCount = async () => (await db.get("updated"))?.size ?? 0

export default
    async function layout(req: Request) {
        let [theme, syncCount, error] = await Promise.all([db.get("settings"), getSyncCount(), db.cache.pop("message")])
        if (error && typeof error === "string") {
            error = [error]
        } else if(error && !Array.isArray(error)) {
            error = void 0
        }
        return render({theme: theme?.theme, error, syncCount, url: req.url})
    }

export type Layout = typeof layout

export interface LayoutTemplateArguments {
    head?: string
    main?: Generator|string
    script?: string
    nav?: Nav[]
}
