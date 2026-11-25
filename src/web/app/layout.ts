// The header around every page but the match play view: the logo, the theme
// and sync buttons, settings, help, login, and the team's tabs.
import html from "html-template-tag-stream";
import * as db from "../data/global-model.js";
import type { Theme } from "../data/db.js";
import { when } from "../data/utils.js";
import type { Nav } from "./page.js";

const sunIcon = "&#127774;",
  moonIcon = "&#127762;";

// The page's theme is <html data-theme> (nimble maps it to color-scheme).
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
    type=button
    _click=theme
    data-theme="${next}"
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
        type=button
        _click=syncNow
        title="${label}"
        aria-label="${label}"
        >&#128259; ${when(count, (count) => html`(${count})`)}</button>`;
}

export function loginView() {
  return html`
    <a id="auth-link" href="/login">Login</a>
  `;
}

export async function headerView(nav: Nav[] | undefined) {
  let [{ theme }, isLoggedIn, updated] = await Promise.all([
    db.settings(),
    db.isLoggedIn(),
    db.updated(),
  ]);
  return html`
<header id=header>
    <nav role=navigation>
        <ul>
            <li>
                <a href="/web/teams">
                    <img style="height:2.5em;" src="/web/images/soccer.svg" alt="Soccer: your teams">
                </a>
            </li>
        </ul>
        <ul>
            <li>
                ${themeView(theme)}

                ${syncCountView(updated.length)}

                <a href="/web/settings" role="button" class="nc-button" aria-label="Settings">&#9881;</a>

                <button
                    type=button
                    class=help-button
                    popovertarget=pageHelp
                    title="How this page works"
                    aria-label="How this page works">?</button>

                ${
                  isLoggedIn
                    ? html`
                        <a id="auth-link" href="/login/?logout" role="button" class="nc-button">Logout</a>
                      `
                    : loginView()
                }
            </li>
        </ul>
    </nav>

    <nav role=navigation>
        <ul class=overflow-auto>
            <li><a href="/web/teams">Teams</a></li>
            ${nav?.map((x) => html`<li><a href="$${x.url}">${x.name}</a></li>`)}
        </ul>
    </nav>
</header>`;
}
