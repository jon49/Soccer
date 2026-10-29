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

// The page's theme is <html data-theme> (nimble maps it to color-scheme),
// rendered by the server. After the theme button's response swaps in a new
// #theme, js/theme.ts copies its data-theme onto <html>.
export function themeView(theme: Theme | undefined) {
  if (theme !== "light" && theme !== "dark") {
    // No saved theme: the page follows the system, so offer whichever theme
    // the system isn't showing. app.css hides the other button.
    return html`<span id=theme>
${themeButton("dark", "theme-system-light")}
${themeButton("light", "theme-system-dark")}
</span>`;
  }
  return html`<span id=theme data-theme="${theme}">
${themeButton(theme === "dark" ? "light" : "dark")}
</span>`;
}

function themeButton(next: "light" | "dark", className = "") {
  return html`<button
    form=post
    formaction="/web/settings?handler=theme"
    name=theme
    value="${next}"
    class="${className}"
    aria-label="Switch to ${next} theme">$${next === "dark" ? moonIcon : sunIcon}</button>`;
}

export function syncCountView(count: number) {
  let label = count
    ? `${count} ${count === 1 ? "change" : "changes"} not synced yet. Tap to sync now.`
    : "Everything is synced. Tap to sync now.";
  return html`
    <button
        id=syncCount
        form=post
        formaction="/web/api/sync?handler=force"
        title="${label}"
        aria-label="${label}"
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
  const [isLoggedIn, updated, settings] = await Promise.all([
    db.isLoggedIn(),
    db.updated(),
    db.settings(),
  ]);
  const { theme, disableAutoSyncDuringGame } = settings;
  const updatedCount = updated.length;

  return html`
<!DOCTYPE html>
<html lang=en$${theme ? ` data-theme="${theme}"` : ""}>
 <head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="auto-sync-disable-during-game" content="${disableAutoSyncDuringGame ? "1" : "0"}">
    <base target=htmz>
    <title>${title} - Soccer</title>
    <link rel="icon" type="image/x-icon" href="/web/images/soccer.ico">
    <link rel="apple-touch-icon" href="/web/images/soccer.png">
    <meta name="theme-color" content="#506f8d">
    <link href="/web/css/app.css" rel=stylesheet>
    ${cssLinks?.map((x) => html`<link href="${x}" rel=stylesheet>`)}
    <link rel="manifest" href="/web/manifest.json">
</head>
<body $${bodyAttr}>
<script>window.app = {}</script>
<div id=head>$${head}</div>
    <div>
    <div id=sw-message></div>
    <header>
        <nav role=navigation>
            <ul>
                <li>
                    <a href="/web/teams" target="_self">
                        <img style="height:2.5em;" src="/web/images/soccer.svg" alt="Soccer Tracker: your teams">
                    </a>
                </li>
            </ul>
            <ul>
                <li>
                    ${themeView(theme)}

                    ${syncCountView(updatedCount)}

                    <a href="/web/settings" role="button" class="nc-button" target="_self" aria-label="Settings">&#9881;</a>

                    ${
                      isLoggedIn
                        ? html`
                            <a id="auth-link" href="/login/?logout" role="button" class="nc-button" target="_self">Logout</a>
                          `
                        : loginView()
                    }
                </li>
            </ul>
        </nav>

        <nav role=navigation>
            <ul class=overflow-auto>
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
