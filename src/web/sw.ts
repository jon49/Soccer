import { useRoutes } from "@jon49/sw/routes.middleware.js";
import { useResponse } from "@jon49/sw/response.middleware.js";
import { swFramework } from "@jon49/sw/web-framework.js";
import { loginView, syncCountView } from "./pages/_layout.html.js";
import { updated as dbUpdated } from "./server/global-model.js";
import html from "html-template-tag-stream";

// @ts-ignore
let version: string = self.sw?.version ?? "unknown";
const isDev = self.location.hostname === "localhost";

if (isDev) {
  let lastSwContent = "";
  swFramework.use(async function devMode(req, res): Promise<void | false> {
    // Refresh file-map links from network
    try {
      let swRes = await fetch("/web/sw.js");
      let swContent = await swRes.text();
      if (swContent !== lastSwContent) {
        lastSwContent = swContent;
        let match = swContent.match(/importScripts\("([^"]+)"/);
        if (match) {
          let mapRes = await fetch(match[1]);
          let mapContent = await mapRes.text();
          let linksMatch = mapContent.match(/links: (\[.*\])/);
          if (linksMatch) {
            let newLinks = JSON.parse(linksMatch[1]);
            // Mutate in-place so the reference in routes.middleware stays current
            let links = (self.sw as any).links;
            links.length = 0;
            links.push(...newLinks);
          }
        }
      }
    } catch {}

    // Serve static files directly from network using resolved hashed URL
    // (bypasses cacheResponse which incorrectly fetches the unhashed URL)
    let url = new URL(req.url);
    let p = url.pathname;
    if (p.startsWith("/web/") && p.lastIndexOf("/") < p.lastIndexOf(".")) {
      let links = (self.sw as any).links;
      let hashed = links?.find((x: any) => x.url === p)?.file || p;
      res.response = await fetch(hashed);
      return false;
    }
  });
}

// The framework toasts this after every successful POST.
const savedMessage = "Saved!";

// Pages the coach uses during a game (rendered by match/_play.ts). Their
// toasts show failures only: a "Saved!" on every tap would get in the way.
function isFromGamePlay(req: Request) {
  if (!req.referrer) return false;
  let referrer = new URL(req.referrer);
  let handler = referrer.searchParams.get("handler");
  return (
    /\/web\/match\/?$/.test(referrer.pathname) &&
    (handler === "play" || handler === "activityPlayerSelector")
  );
}

swFramework.use(useRoutes);
swFramework.use(async function useHtmz(req, res, ctx): Promise<void> {
  if (req.method !== "POST") return;

  let updated = await dbUpdated();

  let messages = (ctx.messages || []) as string[];
  if (isFromGamePlay(req)) {
    messages = messages.filter((x) => x !== savedMessage);
  }

  if (res.error) {
    messages.push(res.error);
  }

  res.body = html`${res.body}
<div id=toasts>
    ${messages.map((x) => html`<dialog class=toast _load=toast open><p class=message>${x}</p></dialog>`)}
</div>
${res.status === 401 ? html`${loginView()}` : null}
${syncCountView(updated.length)}
`;
});
swFramework.use(useResponse);

self.addEventListener("install", (e: Event) => {
  console.log("Service worker installed.");

  // @ts-ignore
  e.waitUntil(
    isDev
      ? // @ts-ignore
        self.skipWaiting()
      : caches.open(version).then(async (cache) => {
          console.log("Caching files.");
          // @ts-ignore
          return cache.addAll(self.sw.links.map((x) => x.file));
        }),
  );
});

// @ts-ignore
self.addEventListener("fetch", (e: FetchEvent) => {
  e.respondWith(swFramework.start(e));
});

// waitUntil must be called before the handler first awaits, or it throws.
// @ts-ignore
self.addEventListener("activate", (e: ExtendableEvent) => {
  console.log("Service worker activated.");
  e.waitUntil(
    (async () => {
      let keys = await caches.keys();
      if (isDev) {
        await Promise.all([
          ...keys.map((key) => caches.delete(key)),
          // @ts-ignore
          self.clients.claim(),
        ]);
        return;
      }
      await Promise.all(keys.filter((x) => x !== version).map((x) => caches.delete(x)));
    })(),
  );
});

// new-app-notifier posts { action: "skipWaiting" }; also accept the bare
// string form.
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting" || event.data?.action === "skipWaiting") {
    console.log("Skip waiting!");
    // @ts-ignore
    self.skipWaiting();
  }
});
