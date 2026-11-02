import { useRoutes } from "@jon49/sw/routes.middleware.js";
import { useResponse } from "@jon49/sw/response.middleware.js";
import { swFramework } from "@jon49/sw/web-framework.js";
import { useHtmz } from "./server/htmz.middleware.js";

// @ts-ignore
let version: string = self.sw?.version ?? "unknown";
const isDev = self.location.hostname === "localhost";

// The file map, for the page to run these routes itself (js/routes.bundle.ts
// via js/routes-loader.ts): where each page's code is, by its hashed name.
// The page can't read the map's own file, as only the worker knows its name.
swFramework.use(function useLinks(req, res): void | false {
  if (new URL(req.url).pathname !== "/web/links.js") return;
  let links = JSON.stringify((self.sw as any).links ?? []);
  res.response = new Response(`(self.sw = self.sw || {}).links = ${links};`, {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" },
  });
  return false;
});

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

swFramework.use(useRoutes);
swFramework.use(useHtmz);
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
      await pruneCache();
    })(),
  );
});

// Drops cached files the current file map doesn't list: earlier releases'
// hashed files. The cache's name doesn't change between releases (`version`
// isn't set on `self.sw` when this file runs), so without this every release
// added its files to the ones before.
async function pruneCache() {
  let links: { file: string }[] = (self.sw as any).links;
  let keep = new Set(links.map((x) => x.file));
  let cache = await caches.open(version);
  let stale = (await cache.keys()).filter((x) => !keep.has(new URL(x.url).pathname));
  await Promise.all(stale.map((x) => cache.delete(x)));
  if (stale.length) console.log(`Removed ${stale.length} old cached files.`);
}

// new-app-notifier posts { action: "skipWaiting" }; also accept the bare
// string form.
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting" || event.data?.action === "skipWaiting") {
    console.log("Skip waiting!");
    // @ts-ignore
    self.skipWaiting();
  }
});
