// The app: registers the service worker, the actions every page can use, and
// renders the page the address names (router.ts).
import { setTheme, settings } from "../data/global-model.js";
import { immediate, setToast } from "./action.js";
import { replace, toast } from "./dom.js";
import { themeView } from "./layout.js";
import { navigate, start } from "./router.js";
import { startAutoSync, syncNow } from "./sync.js";
import { watchForUpdates } from "./update.js";
import "../js/install.js";

setToast(toast);

Object.assign(window.app, {
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
} satisfies typeof window.app);

const isDev = import.meta.env.DEV;
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register(isDev ? "/web/sw.ts" : "/web/sw.js", { type: isDev ? "module" : "classic" })
    .then(watchForUpdates, (e) => console.error("Service worker didn't register:", e));
}

// The saved theme, in case the shell's copy of it is missing.
settings().then(({ theme }) => {
  if (theme && document.documentElement.dataset.theme !== theme) setTheme(theme);
  if (theme) document.documentElement.dataset.theme = theme;
});

start();
startAutoSync();
