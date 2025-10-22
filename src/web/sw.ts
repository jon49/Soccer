import { ValidationResult } from "promise-validation"
import { useRoutes, options } from "@jon49/sw/routes.middleware.js"
import { useResponse } from "@jon49/sw/response.middleware.js"
import { swFramework } from "@jon49/sw/web-framework.js"
import { loginView, syncCountView } from "./pages/_layout.html.js"
import { updated as dbUpdated } from "./server/global-model.js"
import html from "html-template-tag-stream"

// @ts-ignore
let version: string = self.sw?.version ?? "unknown"

swFramework.use(useRoutes)
swFramework.use(
async function useHtmz(req, res, ctx): Promise<void> {
    if (req.method !== "POST") return

    let updated = await dbUpdated()

    let messages = (ctx.messages || []) as string[]

    if (res.error) {
        messages.push(res.error)
    }

    res.body = html`${res.body}
<div id=toasts>
    ${messages.map(x => html`<dialog class=toast traits=x-toaster open><p class=message>${x}</p></dialog>`)}
</div>
${res.status === 401 ? html`${loginView()}` : null}
${syncCountView(updated.length)}
`})
swFramework.use(useResponse)

self.addEventListener('message', async function (event) {
    if (event.data === "skipWaiting") {
        // @ts-ignore
        self.skipWaiting()
    }
})

self.addEventListener("install", (e: Event) => {
    console.log("Service worker installed.")

    // @ts-ignore
    e.waitUntil(caches.open(version).then(async cache => {
        console.log("Caching files.")
        // @ts-ignore
        return cache.addAll(self.sw.links.map(x => x.file))
    }))

})

function handleErrors(errors: any) {
    if (errors instanceof ValidationResult) {
        // @ts-ignore
        return errors.reasons.map(x => x.reason)
    }
    return []
}

// @ts-ignore
self.addEventListener("fetch", (e: FetchEvent) => {
    if (!options.handleErrors) {
        options.handleErrors = handleErrors
    }
    e.respondWith(swFramework.start(e))
})

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

