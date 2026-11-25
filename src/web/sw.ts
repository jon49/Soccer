/// <reference lib="webworker" />
// The service worker does three things:
//
// 1. Keeps the app's files, so it opens offline. The build (vite.config.ts)
//    fills in __FILES__, every file it emits, and __VERSION__, a hash of them.
// 2. Answers a move to any page of the app (/web/teams, /web/match?...) with
//    the app shell, /web/index.html, which renders the page itself.
// 3. Syncs, and makes every other call to the server that needs the login
//    token, when a page asks (app/worker.ts). It runs these one at a time, for
//    every tab, so two can't refresh the token at once or sync over each
//    other.
//
// In development (npm start) the build fills in nothing: Vite serves every
// file and page, and the worker only does (3).
import sync from "./data/sync.js";
import { authFetch } from "./data/api-client.js";
import { deleteAccount, deleteLocalData } from "./data/account.js";
import { afterSync } from "./data/sync-queue.js";

declare const self: ServiceWorkerGlobalScope;
declare const __FILES__: string[];
declare const __VERSION__: string;

const files = typeof __FILES__ === "undefined" ? null : __FILES__;
const cacheName = typeof __VERSION__ === "undefined" ? "dev" : `soccer-${__VERSION__}`;
const shell = "/web/index.html";

const ops: Record<string, (...args: any[]) => Promise<unknown>> = {
  sync: () => sync(),
  async fetch(url: string, init: RequestInit) {
    return afterSync(async () => {
      let res = await authFetch(url, init);
      return {
        status: res.status,
        type: res.headers.get("content-type") ?? "",
        body: res.status ? await res.text() : "",
      };
    });
  },
  deleteAccount: () => deleteAccount(),
  deleteLocalData: () => deleteLocalData(),
};

self.addEventListener("message", (e) => {
  let data = e.data;
  // The page's "update your app" link (app/update.ts), and the one an older
  // version of the app shows: { action: "skipWaiting" }.
  if (data === "skipWaiting" || data?.action === "skipWaiting") {
    self.skipWaiting();
    return;
  }
  let port = e.ports[0];
  let op = ops[data?.op];
  if (!port || !op) return;
  e.waitUntil(
    op(...(data.args ?? [])).then(
      (result) => port.postMessage({ result }),
      (error) => {
        console.error(`Worker "${data.op}" failed:`, error);
        port.postMessage({ error: String(error?.message ?? error) });
      },
    ),
  );
});

self.addEventListener("install", (e) => {
  if (!files) {
    self.skipWaiting();
    return;
  }
  e.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(files)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      let keys = await caches.keys();
      await Promise.all(keys.filter((x) => x !== cacheName).map((x) => caches.delete(x)));
      if (!files) await self.clients.claim();
    })(),
  );
});

function isFile(path: string) {
  return path.lastIndexOf("/") < path.lastIndexOf(".");
}

async function fromCache(req: Request | string) {
  let cache = await caches.open(cacheName);
  return (await cache.match(req)) ?? fetch(req);
}

self.addEventListener("fetch", (e) => {
  if (!files) return;
  let req = e.request;
  let url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/"))
    return;
  if (url.pathname.startsWith("/web/") && !isFile(url.pathname)) {
    e.respondWith(fromCache(shell));
  } else if (files.includes(url.pathname)) {
    e.respondWith(fromCache(url.pathname));
  }
});
