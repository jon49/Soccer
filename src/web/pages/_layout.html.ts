import html from "../server/html.js";
import * as db from "../server/global-model.js";
import { when } from "@jon49/sw/utils.js";
import { Theme } from "../server/db.js";

interface Nav {
  name: string;
  url: string;
}

const sunIcon = "&#127774;",
  moonIcon = "&#127762;";

export function themeView(theme: Theme | undefined) {
  const isSet = theme === "light" || theme === "dark";
  const current: "light" | "dark" = theme === "dark" ? "dark" : "light";
  const next: "light" | "dark" = current === "dark" ? "light" : "dark";
  const icon = current === "dark" ? sunIcon : moonIcon;
  // id="theme" is intentional — base.css selects light/dark via
  // :has(#theme input[value="..."]:checked), so the rendered radio
  // below must live inside an element with that id for the swap to
  // actually flip the theme.
  return html`<span id=theme>
<button form=post formaction="/web/api/settings?handler=theme" name=theme value="${next}">$${icon}</button>
${when(isSet, () => html`<input type=radio name=theme value="${current}" checked hidden>`)}
${when(
  !isSet,
  () => html`
    <script>
      (function () {
        var btn = document.currentScript.parentNode.querySelector("button");
        btn.value =
          window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
        btn.click();
      })();
    </script>
  `,
)}
</span>`;
}

export function syncCountView(count: number) {
  return html`
    <button
        id=syncCount
        form=post
        formaction="/web/api/sync?handler=force"
        >&#128259; ${when(count, (count) => html`(${count})`)}</button>`;
}

const render = async ({
  main,
  head,
  cssLinks,
  scripts,
  nav,
  title,
  bodyAttr,
}: LayoutTemplateArguments) => {
  const [isLoggedIn, updated, { theme }] = await Promise.all([
    db.isLoggedIn(),
    db.updated(),
    db.settings(),
  ]);
  const updatedCount = updated.length;

  return html`
<!DOCTYPE html>
<html>
 <head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <base target=htmz>
    <title>${title} - Soccer</title>
    <link rel="icon" type="image/x-icon" href="/web/images/soccer.ico">
    <link href="/web/css/app.css" rel=stylesheet>
    ${cssLinks?.map((x) => html`<link href="${x}" rel=stylesheet>`)}
    <link rel="manifest" href="/web/manifest.json">
</head>
<body $${bodyAttr}>
<script>window.app = {}</script>
<div id=head>$${head}</div>
    <div class=container>
    <div id=sw-message></div>
    <header>
        <nav role=navigation>
            <ul>
                <li>
                    <a href="/web/teams" target="_self">
                        <img style="height:2.5em;" src="/web/images/soccer.svg"></img>
                    </a>
                </li>
            </ul>
            <ul>
                <li>
                    ${themeView(theme)}

                    ${syncCountView(updatedCount)}

                    ${
                      isLoggedIn
                        ? html`
                            <a id="auth-link" href="/login?logout" role="button" target="_self">Logout</a>
                          `
                        : loginView()
                    }
                </li>
            </ul>
        </nav>

        <nav role=navigation>
            <ul>
                <li><a href="/web/teams" target="_self">Teams</a></li>
                ${
                  !nav || nav.length === 0
                    ? null
                    : nav.map(
                        (x) => html`<li><a href="$${x.url}" target="_self">${x.name}</a></li>`,
                      )
                }
            </ul>
        </nav>
    </header>

    <main id=main>
        ${main}
    </main>

    <div id=toasts></div>
    <div id=temp></div>

    <form id=post method=post hidden></form>
    <script src="/web/js/app.bundle.js" type="module"></script>

    <div id=scripts>${(scripts ?? []).map((x) => html`<script src="${x}" type="module"></script>`)}</div>
    </div>
</body>
</html>`;
};

export function loginView() {
  return html`
    <a id="auth-link" href="/login" target="_self">Login</a>
  `;
}

export default async function layout(o: LayoutTemplateArguments) {
  return render(o);
}

export type Layout = typeof layout;

export interface LayoutTemplateArguments {
  title: string;
  head?: string;
  bodyAttr?: string;
  main?: AsyncGenerator<any, void, unknown>;
  scripts?: string[];
  cssLinks?: string[];
  nav?: Nav[];
}
