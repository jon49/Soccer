import type { RoutePage, RoutePostHandler } from "@jon49/sw/routes.middleware.js";
import { entries } from "idb-keyval";

const {
  globalDb: db,
  html,
  views: { themeView },
} = self.sw;

const postHandlers: RoutePostHandler = {
  async theme({ data }) {
    const submitted = (data as { theme?: string } | undefined)?.theme;
    const theme = submitted === "dark" ? "dark" : "light";

    await db.setTheme(theme, null);

    return {
      status: 200,
      body: html`${themeView(theme)}`,
    };
  },

  async autoSync({ data }) {
    let submitted = (data as { disableAutoSyncDuringGame?: string } | undefined)
      ?.disableAutoSyncDuringGame;
    let disable = submitted === "on" || submitted === "true";

    let current = await db.settings();
    await db.setSettings({ ...current, disableAutoSyncDuringGame: disable });

    return { status: 204 };
  },
};

async function exportData() {
  let all = await entries();
  let data: Record<string, unknown> = {};
  for (let [k, v] of all) {
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

const route: RoutePage = {
  get: { export: exportData },
  post: postHandlers,
};

export default route;
