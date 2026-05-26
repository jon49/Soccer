import type { RoutePage, RoutePostHandler } from "@jon49/sw/routes.middleware.js";
import { entries } from "idb-keyval";

const {
  globalDb,
  html,
  layout,
  utils: { when },
  views: { themeView },
} = self.sw;

const render = async () => {
  let { disableAutoSyncDuringGame } = await globalDb.settings();
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

<h3>Data</h3>
<p><a href="/web/settings?handler=export" role="button" target="_self">Download data as JSON</a></p>
<p>Saves all synced app data to a JSON file on your device.</p>
`;
};

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
  async theme({ data }) {
    const submitted = (data as { theme?: string } | undefined)?.theme;
    const theme = submitted === "dark" ? "dark" : "light";

    await globalDb.setTheme(theme, null);

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
