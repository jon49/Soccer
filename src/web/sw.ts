import "./service-worker/routes.js"
import links from "./entry-points.js"
import staticFiles from "./static-files.js"
import { version } from "./server/settings.js"
import { getResponse } from "./service-worker/route-handling.js"

// check in here for service worker updates
// fetch('/web/sw.js', { cache: 'no-cache', method: 'HEAD' })
// .then(x => console.log(x.headers.get('etag')))
// compare new and old service worker. Keep the old etag value in-memory
// and check for an update every 10 minutes or so with just the head call.
// Maybe if it is localhost check all the time? Or have a button to check for updates.
// See:
// https://github.com/richardanaya/wasm-service/pull/3/files

self.addEventListener("install", async (e: Event) => {
    // @ts-ignore
    self.skipWaiting()
    // @ts-ignore
    e.waitUntil(
        caches.open(version)
        .then((cache: any) => cache.addAll(links.map(x => x.file).concat(staticFiles))))
})

// @ts-ignore
self.addEventListener("fetch", (e: FetchEvent) => e.respondWith(getResponse(e)))

// @ts-ignore
self.addEventListener("activate", async (e: ExtendableEvent) => {
    console.log("Service worker activated.")

    let keys = await caches.keys(),
        deleteMe =
        keys
        .map((x: string) => ((version !== x) && caches.delete(x)))
        .filter(x => x)
    if (deleteMe.length === 0) return
    e.waitUntil(Promise.all(deleteMe))

})

self.addEventListener('message', event => {
    if (event.data.action === 'skipWaiting') {
        console.log("Skip waiting!")
        // @ts-ignore
        return self.skipWaiting()
    }
});

