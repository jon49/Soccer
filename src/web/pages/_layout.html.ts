import html from "../server/html.js"
import * as db from "../server/global-model.js"
import { syncCountView } from "../api/_shared-views.js"
import { when } from "@jon49/sw/utils.js"
import { Theme } from "../server/db.js"

interface Nav {
    name: string
    url: string
}

const defaultTheme = "⛅",
    lightTheme = "&#127774;",
    darkTheme = "&#127762;"

export function themeImage(theme: Theme | undefined) {
    return html`$${theme === "light"
        ? lightTheme
        : theme === "dark"
            ? darkTheme
            : defaultTheme}`
}

const render = async (
    { main,
        head,
        scripts,
        nav,
        title,
        bodyAttr,
    }: LayoutTemplateArguments) => {
    const [isLoggedIn, updated, { theme, defaultTheme }] = await Promise.all([
        db.isLoggedIn(),
        db.updated(),
        db.settings()
    ])
    const updatedCount = updated.length

    return html`
<!DOCTYPE html>
<html $${when(theme, x => x == null ? null : `data-theme=${x}`)}>
 <head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Soccer</title>
    <link rel="icon" type="image/x-icon" href="/web/images/soccer.ico">
    <style> @import url("/web/css/pico.blue.min.css") layer(base); </style>
    <link href="/web/css/app.css" rel=stylesheet>
    <link rel="manifest" href="/web/manifest.json">
</head>
<body $${bodyAttr}>
<div id=head>$${head}</div>
    <div class=container>
    <div id=sw-message></div>
    <header>
        <nav role=navigation>
            <ul>
                <li>
                    <a href="/web/">
                        <img style="height:2.5em;" src="/web/images/soccer.svg"></img>
                    </a>
                </li>
            </ul>
            <ul>
                <li>
                    <button
                        form=post-form
                        formaction="/web/api/settings?handler=theme"
                        hf
                        >$${themeImage(theme)}</button>

                    <button
                        form=post-form
                        formaction="/web/api/sync?handler=count"
                        formmethod=get
                        hidden

                        traits=on
                        data-events="hf:completed"
                        data-match="detail: {method:'post'}"

                        hf-scroll-ignore
                        hf-target="#sync-count">
                    </button>

                    <button
                        id=sync-count
                        form=post-form
                        formaction="/web/api/sync?handler=force"
                        hf-target
                        >${syncCountView(updatedCount)}</button>

                    ${isLoggedIn
            ? html`<a id=auth-link href="/login?logout" role=button>Logout</a>`
            : loginView()}
                </li>
            </ul>
        </nav>

        <nav role=navigation>
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

    <template id=toast-template><dialog class="toast" traits=x-toaster open><p class=message></p></dialog></template>
    <div id=toasts></div>
    <div id=dialogs></div>

${() => {
    if (defaultTheme) return

    return html`<form
    id="default-theme"
    method=post
    action="/web/api/settings?handler=defaultTheme"
    hf-target="#default-theme"
    hf-swap="outerHTML">
    <input
        name=defaultTheme
        onload="this.value = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; this.form.requestSubmit();">
</form>`
}}

    <form id=post-form method=post hidden></form>
    <form id=get-form method=get hidden></form>
    <script src="/web/js/app.bundle.js" type="module"></script>
    <div id=scripts>${(scripts ?? []).map(x => html`<script src="${x}" type="module"></script>`)}</div>
    </div>
</body>
</html>`
}

export function loginView() {
    return html`<a id=auth-link href="/login">Login</a>`
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
