import type { RoutePage, RoutePostHandler } from "@jon49/sw/routes.middleware.js";
import { entries } from "idb-keyval";
import { deleteAccount } from "../server/account.js";

const {
  globalDb,
  html,
  layout,
  utils: { reject, when },
  views: { themeView, loginView },
} = self.sw;

const render = async () => {
  let [{ disableAutoSyncDuringGame, hideHelp }, loggedIn] = await Promise.all([
    globalDb.settings(),
    globalDb.isLoggedIn(),
  ]);

  return html`
<h2>Settings</h2>

<form class=form method=post action="/web/settings?handler=autoSync" onchange="this.submit()">
  <div>
    <label>
      <input
          type=checkbox
          name=disableAutoSyncDuringGame
          $${when(disableAutoSyncDuringGame, "checked")}>
      Disable auto-sync during games
    </label>
    <p class=muted>
      When on, the app will not auto-sync while you are on a match page. You
      can still tap the sync button to sync manually.
    </p>
  </div>
</form>

<form class=form method=post action="/web/settings?handler=help" onchange="this.submit()">
  <div>
    <label>
      <input
          type=checkbox
          name=showHelp
          $${when(!hideHelp, "checked")}>
      Show the Getting started steps
    </label>
    <p class=muted>
      Shows the Getting started steps on a team until its first game. The ? at
      the top of a page always explains that page.
    </p>
  </div>
</form>

<h3>Data</h3>
<p><a href="/web/settings?handler=export" role="button" class="nc-button" target="_self">Download data as JSON</a></p>
<p>Saves all synced app data to a JSON file on your device.</p>

${accountView(loggedIn)}
`;
};

// accountView: deleting the account, while logged in.
function accountView(loggedIn: boolean) {
  if (!loggedIn)
    return html`
      <div id="account"></div>
    `;
  return html`
    <section id="account" class="danger-zone">
      <h3>Delete account</h3>
      <p>
        Permanently deletes your account and the teams, games and stats you've synced, from the server
        and from this device. Teams you share with other coaches stay with them. This can't be undone.
      </p>
      <p>
        Other devices you use this app on keep their own copy of your data. They are logged out the next
        time they sync, but you'll need to remove the data on each of them yourself.
      </p>
      <button
        class="danger"
        form="post"
        formaction="/web/settings?handler=deleteAccount"
        data-confirm="Delete your account and all of its data? This can't be undone. Other devices keep their copy until you remove it there."
        _click="confirm"
      >
        Delete account
      </button>
    </section>
  `;
}

async function exportData() {
  let all = await entries();
  let data: Record<string, unknown> = {};
  for (let [k, v] of all) {
    if (!v || typeof v !== "object" || !("_rev" in v)) continue;
    let key = Array.isArray(k) ? JSON.stringify(k) : String(k);
    data[key] = v;
  }
  let json = JSON.stringify(data, (_, v) => (v instanceof Set ? Array.from(v) : v), 2);
  let filename = `soccer-data-${new Date().toISOString().slice(0, 10)}.json`;
  return {
    body: json,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  };
}

const postHandlers: RoutePostHandler = {
  async deleteAccount() {
    let status = await deleteAccount();
    if (status === 401) {
      return { status: 401, message: "Log in again, then delete your account." };
    }
    if (status === 0) {
      return reject("You appear to be offline. Connect to the internet and try again.");
    }
    if (status < 200 || status >= 300) {
      return reject(`Could not delete your account (status ${status}).`);
    }
    return {
      status: 200,
      body: html`${accountView(false)}${loginView()}`,
      message: "Your account and its data were deleted.",
    };
  },

  async theme({ data }) {
    const submitted = (data as { theme?: string } | undefined)?.theme;
    const theme = submitted === "dark" ? "dark" : "light";

    await globalDb.setTheme(theme);

    return {
      status: 200,
      body: html`${themeView(theme)}`,
    };
  },

  async autoSync({ data }) {
    let submitted = (data as { disableAutoSyncDuringGame?: string } | undefined)
      ?.disableAutoSyncDuringGame;
    let disable = submitted === "on" || submitted === "true";

    let current = await globalDb.settings();
    await globalDb.setSettings({ ...current, disableAutoSyncDuringGame: disable });

    return { status: 204 };
  },

  async help({ data }) {
    let submitted = (data as { showHelp?: string } | undefined)?.showHelp;
    let show = submitted === "on" || submitted === "true";

    let current = await globalDb.settings();
    await globalDb.setSettings({ ...current, hideHelp: !show });

    return { status: 204 };
  },
};

const route: RoutePage = {
  get: {
    async get() {
      return layout({
        main: await render(),
        title: "Settings",
      });
    },
    export: exportData,
  },
  post: postHandlers,
};

export default route;
