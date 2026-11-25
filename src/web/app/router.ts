// The app's pages, by path. A link to one of them, back and forward, and
// `navigate()` render the page here, from its module (loaded the first time
// it's opened), without loading a new document. The service worker answers a
// reload or a typed address with the app shell (index.html), which renders
// the page the same way.
import { setLoggedIn } from "../data/global-model.js";
import { enqueue, runLoads } from "./action.js";
import { $, text, toast } from "./dom.js";
import { headerView } from "./layout.js";
import type { Page, Query } from "./page.js";

type Load = () => Promise<{ default: Page }>;

const routes: Record<string, Load> = {
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
};

function routeOf(url: URL): Load | undefined {
  if (url.origin !== location.origin) return;
  let path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return routes[path];
}

let current: Page | undefined;
// Each render takes a number; only the latest one is put on the page.
let latest = 0;

history.scrollRestoration = "manual";

function saveScroll() {
  history.replaceState({ ...history.state, scrollY: window.scrollY }, "");
}

async function render(url: URL, scrollY: number | null) {
  let n = ++latest;
  let load = routeOf(url);
  if (!load) {
    location.assign(url);
    return;
  }
  let main: string, header: string, title: string, bare: boolean | undefined;
  let page: Page | undefined;
  try {
    page = (await load()).default;
    if (url.searchParams.get("login") === "success") await setLoggedIn(true);
    let query: Query = Object.fromEntries(url.searchParams);
    let view = await page.render({ query, url });
    [main, header] = await Promise.all([
      text(view.main),
      view.bare ? "" : text(headerView(view.nav)),
    ]);
    title = view.title;
    bare = view.bare;
  } catch (e) {
    if (n !== latest) return;
    console.error(`Couldn't render ${url}:`, e);
    let messages = (Array.isArray(e) ? e.flat(Infinity) : [e]).map((x: any) =>
      typeof x === "string" ? x : "Oops something happened which shouldn't have!",
    );
    page = undefined;
    main = `<p>Sorry, that page couldn't be shown.</p>`;
    header = await text(headerView([]));
    title = "Not found";
    bare = false;
    toast(...messages);
  }
  if (n !== latest) return;

  current = page;
  for (let { name } of Array.from(document.body.attributes)) document.body.removeAttribute(name);
  document.title = `${title} - Soccer`;
  let headerEl = $("header")!;
  headerEl.outerHTML = bare ? `<header id=header hidden></header>` : header;
  let mainEl = $("main")!;
  mainEl.app = page?.actions;
  mainEl.innerHTML = main;
  runLoads();
  // As a new document would (innerHTML doesn't).
  mainEl.querySelector<HTMLElement>("[autofocus]")?.focus();

  if (scrollY != null) {
    window.scrollTo(0, scrollY);
  } else if (url.hash) {
    document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView();
  } else {
    window.scrollTo(0, 0);
  }
  // The first time, for tasks/measure-startup.sh and measure-speed.sh.
  if (!performance.getEntriesByName("app:page").length) performance.mark("app:page");
  document.dispatchEvent(new CustomEvent("app:page", { detail: { url: url.href } }));
}

// Opens the app's page at `href`, as a link to it would.
export function navigate(href: string, { replace = false } = {}) {
  let url = new URL(href, location.href);
  if (!routeOf(url)) {
    location.assign(url);
    return Promise.resolve();
  }
  saveScroll();
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
  return render(url, null);
}

// Draws the page again, as it now is in the database, where it is scrolled,
// or just what changed if the page can (Page.refresh). After any action in
// progress, so the two don't draw over each other.
export function refresh() {
  return enqueue(async () => {
    let url = new URL(location.href);
    let page = current;
    if (page?.refresh) {
      let drawn = await page.refresh({ query: Object.fromEntries(url.searchParams), url });
      if (drawn !== false) {
        document.dispatchEvent(new CustomEvent("app:refresh"));
        return;
      }
    }
    await render(url, window.scrollY);
  });
}

export function start() {
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    let a = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (!(a instanceof HTMLAnchorElement) || a.hasAttribute("download")) return;
    if (a.target && a.target !== "_self") return;
    let url = new URL(a.href);
    if (!routeOf(url)) return;
    // A link to a part of this page.
    let here = new URL(location.href);
    if (url.hash && url.pathname === here.pathname && url.search === here.search) return;
    e.preventDefault();
    navigate(url.href);
  });

  window.addEventListener("popstate", () => {
    render(new URL(location.href), history.state?.scrollY ?? 0);
  });

  return render(new URL(location.href), null);
}
