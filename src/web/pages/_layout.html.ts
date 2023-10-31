import html from "../server/html.js"
import { version } from "../server/settings.js"
import { when } from "../server/shared.js"
import { Theme } from "./user-settings/edit.html.js"
import { errors, messages } from "../service-worker/route-handling.js"
import db from "../server/global-model.js"

interface Nav {
    name: string
    url: string
}

interface Render {
    theme: Theme | undefined
    referrer: URL | null
}

const render = async (
    {theme}: Render,
    { main,
      head,
      scripts,
      nav,
      title,
      bodyAttr,
      useHtmf
    }: LayoutTemplateArguments) => {
    const [isLoggedIn, updated, { lastSynced }] = await Promise.all([
        db.credentials(),
        db.updated(),
        db.settings()
    ])
    const updatedCount = updated.length

    return html`
<!DOCTYPE html>
<html>
 <head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Soccer</title>
    <link href="/web/css/index.css" rel=stylesheet>
    <link href="/web/css/app.css" rel=stylesheet>
    $${head}
</head>
<body $${when(theme, x => `class=${x}`)} $${bodyAttr}>
    <div class=top-nav>
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

       <form method=post action="/web/api/sync?handler=force" class=inline>
           <button id=sync-count class=bg>&#128259; ${when(updatedCount, count => html`(${count})`)}</button>
       </form>

        ${isLoggedIn
            ? html`<a href="/login?handler=logout">Logout</a>`
        : html`<a href="/web/login">Login</a>`}
        
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
        ${main}
    </main>
    ${function* printErros() {
        while (errors.length) {
            const e = errors.shift()
            if (e) yield html`<dialog class=toast open><p class=error>${e}</p></dialog>`
        }
    }}

    <template id=toast-template><dialog class=toast open><p class=message></p></dialog></template>
    <div id=toasts>
    ${function* printMessages() {
        while (messages.length) {
            const m = messages.shift()
            if (m) yield html`<dialog class=toast open><p class=message>${m}</p></dialog>`
        }
    }}
    </div>

    <footer><p>${version}</p></footer>
    ${ null /*useHtmf
        ? html`<script src="/web/js/lib/htmf.min.js"></script>`
    : html`<script src="/web/js/lib/mpa.min.js"></script>`*/ }
    ${when(useHtmf, () => html`<script src="/web/js/lib/htmf.min.js"></script>`)}
    <script src="/web/js/lib/mpa.min.js"></script>
    ${(scripts ?? []).map(x => html`<script src="${x}"></script>`)}
    <script>
        App = window.App ?? {};
        ${when(updatedCount, _ => html`App.shouldWaitToSync = true`)}
        ${when(+new Date() - lastSynced > /* 2 hours */ 1e3*60*60*2, _ => html`App.shouldSync = true`)}
    </script>
    <script src="/web/js/app.js"></script>
</body>
</html>`
}

export default
    async function layout(req: Request, o: LayoutTemplateArguments) {
        let referrer = req.referrer ? new URL(req.referrer) : null
        return render({ referrer, theme: undefined }, o)
    }

export type Layout = typeof layout

export interface LayoutTemplateArguments {
    title: string
    head?: string
    bodyAttr?: string
    main?: AsyncGenerator<any, void, unknown>
    scripts?: string[]
    nav?: Nav[]
    useHtmf?: boolean
}
