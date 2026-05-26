import type { RoutePage, RoutePostHandler } from "@jon49/sw/routes.middleware.js";

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

const route: RoutePage = {
  post: postHandlers,
};

export default route;
