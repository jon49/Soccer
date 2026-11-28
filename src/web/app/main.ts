// The app: registers the service worker, the actions every page can use, and
// renders the page the address names (@jon49/web/app/router.js).
import { setLoggedIn, setTheme, settings } from "../data/global-model.js";
import { globalActions, immediate } from "@jon49/web/app/action.js";
import { replace } from "@jon49/web/app/dom.js";
import { navigate, start } from "@jon49/web/app/router.js";
import { registerServiceWorker } from "@jon49/web/app/update.js";
import { headerView, themeView } from "./layout.js";
import type { PageView } from "./page.js";
import { startAutoSync, syncNow } from "./sync.js";
import "../js/install.js";

Object.assign(globalActions, {
  // The header's theme button.
  async theme({ el }) {
    let theme: "dark" | "light" = el.dataset.theme === "dark" ? "dark" : "light";
    await setTheme(theme);
    document.documentElement.dataset.theme = theme;
    await replace(themeView(theme));
  },

  syncNow,

  // A button or link with data-confirm asks first; "Cancel" stops it.
  confirm: immediate(({ ev, el }) => {
    if (!window.confirm(el.dataset.confirm)) ev.preventDefault();
  }),

  clearAutoFocus: immediate(({ el }) => {
    el.removeAttribute("autofocus");
  }),

  // After a form's other actions: empties it.
  reset({ form }) {
    form?.reset();
  },

  // `_load=redirect data-url=...`: goes to that page instead.
  redirect({ el }) {
    navigate(el.dataset.url || "/web/teams", { replace: true });
  },
} satisfies typeof globalActions);

registerServiceWorker(import.meta.env.DEV);

// The saved theme, in case the shell's copy of it is missing.
settings().then(({ theme }) => {
  if (theme && document.documentElement.dataset.theme !== theme) setTheme(theme);
  if (theme) document.documentElement.dataset.theme = theme;
});

start<PageView>({
  routes: {
    "/web/": () => import("../pages/index.page.js"),
    "/web/teams/": () => import("../pages/teams.page.js"),
    "/web/players/": () => import("../pages/players.page.js"),
    "/web/positions/": () => import("../pages/positions.page.js"),
    "/web/games/": () => import("../pages/games.page.js"),
    "/web/match/": () => import("../pages/match/match.page.js"),
    "/web/stats/": () => import("../pages/stats/stats.page.js"),
    "/web/stats/edit/": () => import("../pages/stats/edit/stats-edit.page.js"),
    "/web/settings/": () => import("../pages/settings.page.js"),
    "/web/share/": () => import("../pages/share.page.js"),
    "/web/join/": () => import("../pages/join.page.js"),
    "/web/install/": () => import("../pages/install.page.js"),
  },
  title: (title) => `${title} - Soccer`,
  // The match play view (bare) has no header.
  header: (view) => (view?.bare ? null : headerView(view?.nav ?? [])),
  async beforeRender(url) {
    if (url.searchParams.get("login") === "success") await setLoggedIn(true);
  },
});
startAutoSync();
