// The match play view's taps, handled in the page rather than the service
// worker. Every tap ends in a form POST to the htmz iframe (a `form=post`
// button, or match-select.js submitting #post); this catches those submits,
// runs the same match.page.ts handler the service worker would, and merges
// the HTML it would have answered with (the view, toasts and the sync count,
// as sw.ts's useHtmz adds them) into the page with htmz's own swap. That
// skips the round trip through the service worker: starting the request,
// the worker, and loading its response as a document (see "Speed in use" in
// docs/startup-and-size.html).
//
// Both run the same code on the same IndexedDB, so the service worker still
// renders the page, syncs, and answers anything this doesn't handle; if this
// script fails to load, the forms post to it as before.
import "../server/shared.global.js";
import type { RoutePostHandler } from "@jon49/sw/routes.middleware.js";
import route from "../pages/match/match.page.js";

const {
  globalDb,
  html,
  utils: { isHtml },
  views: { loginView, syncCountView },
} = self.sw;

const handlers = route.post as RoutePostHandler;

// Taps run one at a time, so two can't interleave their reads and writes.
let queue = Promise.resolve();

document.addEventListener("submit", (e) => {
  let form = e.target;
  if (!(form instanceof HTMLFormElement)) return;
  let submitter = e.submitter instanceof HTMLButtonElement ? e.submitter : null;
  let method = submitter?.getAttribute("formmethod") ?? form.getAttribute("method") ?? "get";
  let target =
    submitter?.getAttribute("formtarget") ??
    form.getAttribute("target") ??
    document.querySelector("base")?.getAttribute("target");
  if (method.toLowerCase() !== "post" || target !== "htmz") return;

  let url = new URL(submitter?.hasAttribute("formaction") ? submitter.formAction : form.action);
  let handler = url.searchParams.get("handler") ?? "";
  if (
    !/^\/web\/match\/?$/.test(url.pathname) ||
    !Object.prototype.hasOwnProperty.call(handlers, handler)
  )
    return;

  e.preventDefault();
  let data = formData(new FormData(form, submitter));
  queue = queue.then(() => run(url, handler, data)).catch((x) => console.error(x));
});

async function run(url: URL, handler: string, data: Record<string, unknown>) {
  let started = performance.now();
  let { body, messages, status } = await call(url, handler, data);
  let count = (await globalDb.updated()).length;
  let text = await render(html`${body}
<div id=toasts>
    ${messages.map((x) => html`<dialog class=toast _load=toast open><p class=message>${x}</p></dialog>`)}
</div>
${status === 401 ? html`${loginView()}` : null}
${syncCountView(count)}
`);
  let rendered = performance.now();
  window.htmzSwap(new DOMParser().parseFromString(text, "text/html"), {
    handler,
    started,
    rendered,
  });
}

// The handler's result as the router in @jon49/sw makes it: rejections and
// thrown messages become toasts, and anything else that throws a generic one.
// No "Saved!": the play view shows failures only (see isFromGamePlay in sw.ts).
async function call(url: URL, handler: string, data: Record<string, unknown>) {
  let messages: string[] = [];
  let body: unknown = null;
  let status: number | undefined;
  try {
    let result: any = await handlers[handler]({
      query: queryOf(url),
      data,
      req: new Request(url, { method: "POST", referrer: location.href }),
    });
    if (isHtml(result)) {
      body = result;
    } else if (result) {
      if (isHtml(result.body)) body = result.body;
      if (result.message) messages.push(result.message);
      else if (result.messages?.length) messages.push(...result.messages);
      status = result.status;
    }
  } catch (e: unknown) {
    let list =
      typeof e === "string" ? [e] : hasMessage(e) ? [e.message] : Array.isArray(e) ? e : null;
    if (list) {
      messages.push(...list.map((x) => String(hasMessage(x) ? x.message : x)));
    } else {
      console.error(`"${handler}" error:`, e);
      messages.push("An error occurred while processing your request.");
    }
  }
  return { body, messages, status };
}

// The query as the router passes it: each parameter read from the URL, so a
// missing one is null.
function queryOf(url: URL) {
  return new Proxy(url, {
    get: (o, prop) => (prop === "_url" ? o : o.searchParams.get(String(prop))),
  });
}

// Form fields as the router reads them; `name[]` collects into an array.
function formData(fd: FormData) {
  let o: Record<string, unknown> = {};
  for (let [key, val] of fd.entries()) {
    if (key.endsWith("[]")) {
      key = key.slice(0, -2);
      o[key] = [...((o[key] as unknown[]) ?? []), val];
    } else {
      o[key] = val;
    }
  }
  return o;
}

async function render(page: AsyncGenerator<unknown>) {
  let text = "";
  for await (let x of page) if (typeof x === "string") text += x;
  return text;
}

function hasMessage(x: unknown): x is { message: unknown } {
  return x != null && typeof x === "object" && "message" in x;
}
