// The service worker's routes, run in the page. A form posted or a link
// opened to the htmz iframe, and a move to another page (htmz-nav), would
// each be a round trip through the worker: starting the request, the worker
// running the page's handler, and loading its answer as a document. Here
// the page runs the same handler, with the worker's own router and
// middleware (@jon49/sw's useRoutes and useResponse, and useHtmz), on the
// same IndexedDB, and swaps in the HTML the worker would have answered with
// (see "Speed in use" in docs/startup-and-size.html).
//
// routes-loader.ts loads this once the page is idle, after the file map
// (/web/links.js, from the worker), settings.global.js (the route table) and
// shared.global.js (self.sw), which the router reads as it loads. Each
// page's code is loaded from the worker's cache the first time it's needed,
// as the worker does. Until then, and for whatever inPage() leaves out, the
// worker answers as before.
import { useRoutes } from "@jon49/sw/routes.middleware.js";
import { useResponse } from "@jon49/sw/response.middleware.js";
import { swFramework } from "@jon49/sw/web-framework.js";
import { isHtml } from "@jon49/sw/utils.js";
import { useHtmz } from "../server/htmz.middleware.js";

swFramework.use(useRoutes);
swFramework.use(useHtmz);
// HTML as one string, which the page wants anyway: useResponse would stream
// it through the Response, encoding and decoding each piece, which costs a
// match tap about 10 ms on a Moto G7.
swFramework.use(async function useText(_req, res: any): Promise<void | false> {
  if (!isHtml(res.body)) return;
  let text = "";
  for await (let x of res.body) if (typeof x === "string") text += x;
  // Always 200, as useResponse answers HTML: a failure's toasts come with
  // the router's 204, which can't carry a body.
  res.response = new Response(text, {
    headers: { "content-type": "text/html; charset=utf-8", ...res.headers },
  });
  return false;
});
swFramework.use(useResponse);

// Left to the worker:
// - what calls the server (sync, the account, sharing and joining, a
//   published schedule): it gains nothing here, and the worker's queue
//   (sync-queue.ts) and the login token refresh (api-client.ts) assume one
//   caller at a time;
// - settings, other than the theme button on every page;
// - the match play view and the position picker, which load as documents
//   with scripts of their own (htmz-nav would load them anyway).
function inPage(url: URL, method: "get" | "post") {
  if (url.origin !== location.origin) return false;
  let { pathname } = url;
  // A file, not a page.
  if (pathname.lastIndexOf("/") < pathname.lastIndexOf(".")) return false;
  let path = pathname.endsWith("/") ? pathname : `${pathname}/`;
  let handler = url.searchParams.get("handler");
  if (!path.startsWith("/web/") || path.startsWith("/web/api/")) return false;
  switch (path) {
    case "/web/share/":
    case "/web/join/":
      return false;
    case "/web/settings/":
      return method === "post" && handler === "theme";
    case "/web/games/":
      return handler !== "publishSchedule";
    case "/web/match/":
      return method === "post" || (handler !== "play" && handler !== "activityPlayerSelector");
  }
  return true;
}

// Requests run one at a time, so two can't interleave their reads and
// writes, and a page opened just after a save shows it.
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(f: () => Promise<T>): Promise<T> {
  let result = queue.then(f);
  queue = result.catch((x) => console.error(x));
  return result;
}

function answer(req: Request) {
  return swFramework.start({ request: req } as FetchEvent);
}

// The answer swapped into the page, as htmz does with the iframe's
// document. A POST whose handler returns nothing redirects back to the page
// it came from; the iframe would load that, and so does this.
async function swapIn(req: Request, handler: string) {
  let started = performance.now();
  let res = await answer(req);
  let location = res.status === 303 && res.headers.get("location");
  if (location && inPage(new URL(location), "get")) {
    res = await answer(new Request(location, { referrer: req.url }));
  }
  let text = await res.text();
  let rendered = performance.now();
  window.htmzSwap(new DOMParser().parseFromString(text, "text/html"), {
    handler,
    started,
    rendered,
  });
}

// A form's POST, with its fields as read from the form. The router reads them
// with formData(); as a body it would have to read them back out of the
// request, which costs a match tap several ms on a Moto G7.
class FormRequest extends Request {
  #data: FormData;
  constructor(url: URL, data: FormData) {
    super(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      referrer: location.href,
    });
    this.#data = data;
  }
  override formData() {
    return Promise.resolve(this.#data);
  }
}

function htmzTarget(target: string | null | undefined) {
  return (target ?? document.querySelector("base")?.getAttribute("target")) === "htmz";
}

document.addEventListener("submit", (e) => {
  if (e.defaultPrevented) return;
  let form = e.target;
  if (!(form instanceof HTMLFormElement)) return;
  let submitter = e.submitter instanceof HTMLButtonElement ? e.submitter : null;
  let method = submitter?.getAttribute("formmethod") ?? form.getAttribute("method") ?? "get";
  if (method.toLowerCase() !== "post") return;
  if (!htmzTarget(submitter?.getAttribute("formtarget") ?? form.getAttribute("target"))) return;
  if (form.enctype === "multipart/form-data") return;
  let url = new URL(submitter?.hasAttribute("formaction") ? submitter.formAction : form.action);
  if (!inPage(url, "post")) return;

  e.preventDefault();
  let req = new FormRequest(url, new FormData(form, submitter));
  enqueue(() => swapIn(req, url.searchParams.get("handler") ?? ""));
});

// Links that open in the htmz iframe (most of them: the layout has
// <base target=htmz>), such as a tab of the stats page.
document.addEventListener("click", (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
    return;
  let a = e.target instanceof Element ? e.target.closest("a[href]") : null;
  if (!(a instanceof HTMLAnchorElement) || a.hasAttribute("download")) return;
  if (!htmzTarget(a.getAttribute("target"))) return;
  let url = new URL(a.href);
  if (!inPage(url, "get")) return;

  e.preventDefault();
  let req = new Request(url, { referrer: location.href });
  enqueue(() => swapIn(req, url.searchParams.get("handler") ?? ""));
});

// Pages for htmz-nav, which morphs them in as it would one it fetched.
window.htmzFetch = (href: string) => {
  let url = new URL(href, location.href);
  if (!inPage(url, "get")) return null;
  return enqueue(() => answer(new Request(url, { referrer: location.href })));
};

// For the e2e tests and tasks/measure-speed.sh: taps from here on are
// handled in the page.
window.routesInPage = true;
performance.mark("routes-in-page");
