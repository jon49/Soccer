import html from "../server/html.js"
import { version } from "../server/settings.js"
import { when } from "../server/shared.js"
import { errors, messages } from "../service-worker/route-handling.js"
import db from "../server/global-model.js"
import { syncCountView } from "../api/sync.js"
import { themeView } from "../api/settings.js"

interface Nav {
    name: string
    url: string
}

const render = async (
    { main,
      head,
      scripts,
      nav,
      title,
      bodyAttr,
    }: LayoutTemplateArguments) => {
    const [isLoggedIn, updated, { lastSynced, theme }] = await Promise.all([
        db.isLoggedIn(),
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
    <link rel="icon" type="image/x-icon" href="/web/images/soccer.ico">
    <link href="/web/css/index.css" rel=stylesheet>
    <link href="/web/css/app.css" rel=stylesheet>
    <link rel="manifest" href="/web/manifest.json">
</head>
<body $${when(theme, x => `class=${x}`)} $${bodyAttr}>
    <div id=head>$${head}</div>
    <div class=top-nav>
        <form method=post action="/web/api/settings?handler=theme" class=inline>
            ${themeView(theme)}
        </form>

       <form method=post action="/web/api/sync?handler=force" class=inline>
           <button id=sync-count class=bg>${syncCountView(updatedCount)}</button>
       </form>

        ${isLoggedIn
            ? html`<a href="/login?logout">Logout</a>`
        : html`<a href="/login">Login</a>`}

    </div>
    <header>
        <div class=sync>
            <h1 class=inline>Soccer</h1>
        </div>
        <nav id=nav-main>
            <ul>
                <li><button form=href formaction="/web/teams">Teams</button></li>
                ${ !nav || nav.length === 0
                    ? null
                : nav.map(x => html`<li><button form=href formaction="$${x.url}">${x.name}</button></li>`) }
            </ul>
        </nav>
    </header>
    <main>
        ${main}
    </main>
    <div id=errors>
    ${function* printErros() {
        while (errors.length) {
            const e = errors.shift()
            if (e) yield html`<dialog class=toast open><p class=error>${e}</p></dialog>`
        }
    }}
    </div>

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

    <form id=href hf-select="title,#head,#nav-main,main,#errors,#toasts,#scripts"></form>
    <form id=get-sync-count-form action="/web/api/sync?handler=count" hf-target="#sync-count"></form>
    <script src="/web/js/lib/htmf.min.js"></script>

    <div id=scripts>${(scripts ?? []).map(x => html`<script src="${x}"></script>`)}</div>
    <script>
        App = window.App ?? {};
        ${when(updatedCount, _ => html`App.shouldWaitToSync = true`)}
        ${when(+new Date() - (lastSynced || 0) > /* 2 hours */ 1e3*60*60*2, _ => html`App.shouldSync = true`)}
    </script>
    <script src="/web/js/app.js"></script>
</body>
</html>`
}

export default
    async function layout(_: Request, o: LayoutTemplateArguments) {
        return render(o)
    }

export type Layout = typeof layout

export interface LayoutTemplateArguments {
    title: string
    head?: string
    bodyAttr?: string
    main?: AsyncGenerator<any, void, unknown>
    scripts?: string[]
    nav?: Nav[]
}
