import html from "../server/html.js"
import { version } from "../server/settings.js"
import { when } from "../server/shared.js"
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
    const [isLoggedIn, updated, { theme }] = await Promise.all([
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
    <script> window.app = { scripts: new Map() } </script>
    <div id=head>$${head}</div>
    <div class=top-nav>
        <form method=post action="/web/api/settings?handler=theme" class=inline>
            ${themeView(theme)}
        </form>

       <form method=post action="/web/api/sync?handler=force" class=inline>
           <button id=sync-count class=bg>${syncCountView(updatedCount)}</button>
       </form>
       <form
            id=soft-sync
            is=form-subscribe
            data-event="hf:completed"
            data-match="detail:{method:'post'}"
            data-match-not="detail:{form:{id:'soft-sync'}}"
            data-debounce="6e5"

            onload="this.requestSubmit()"
            method=post
            action="/web/api/sync"
            hidden>
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
                <li><a href="/web/teams">Teams</a></li>
                ${!nav || nav.length === 0
            ? null
            : nav.map(x => html`<li><a href="$${x.url}">${x.name}</a></li>`)}
            </ul>
        </nav>
    </header>
    <main>
        ${main}
    </main>

    <template id=toast-template><dialog class=toast is=x-toaster open><p class=message></p></dialog></template>
    <div id=toasts></div>
    <div id=dialogs></div>

    <footer><p>${version}</p></footer>

    <form id=href hf-select="title,#head,#nav-main,main,#errors,#toasts,#scripts">
        <button id=href-nav class=hidden></button>
    </form>
    <form
        id=get-sync-count-form
        action="/web/api/sync?handler=count"

        is=form-subscribe
        data-event="hf:completed"
        data-match="detail: {method:'post'}"

        hf-scroll-ignore
        hf-target="#sync-count"></form>

    <script src="/web/js/app.js"></script>
    <script src="/web/js/x-toaster.js"></script>
    <div id=scripts>${(scripts ?? []).map(x => html`<script src="${x}"></script>`)}</div>
</body>
</html>`
}

export default
    async function layout(o: LayoutTemplateArguments) {
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
