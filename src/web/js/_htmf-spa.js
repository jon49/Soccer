const w = window,
    doc = document


let loadedScripts = new Set()
doc.addEventListener("hf:script:load", async e => {
    let detail = e.detail
    if (!detail.script) return
    let script = w.app.scripts.get(detail.script)
    if (!script) return
    if (script.load) {
        loadedScripts.add(detail.script)
        await script.load()
    }
})

doc.addEventListener("hf:beforeRequest", e => {
    let detail = e.detail
    if (detail.method === "get" && detail.form.id === "href") {
        for (let script of loadedScripts) {
            w.app.scripts.get(script)?.unload()
        }
        loadedScripts.clear()
    }
})

let shouldHandleHash = true
doc.addEventListener("hf:completed", e => {
    let detail = e.detail
    if (detail.method !== "get") return
    if (detail.form.id === "href" && detail.submitter?.id !== "href-nav") {
        let url = new URL(detail?.submitter?.formAction ?? detail.form.action)
        shouldHandleHash = false
        location.hash = url.pathname + url.search
    }
})

// In the future use the `navigate` event.
// https://developer.mozilla.org/en-US/docs/Web/API/Navigation/navigate_event
doc.addEventListener("click", e => {
    let target = e.target
    if (target instanceof HTMLAnchorElement) {
        let pathname = target.getAttribute("href")
        if (pathname.startsWith("/web/")) {
            e.preventDefault()
            shouldHandleHash = false
            location.hash = pathname
            handleHash()
        }
    }
})

w.addEventListener("hashchange", () => {
    if (shouldHandleHash) {
        handleHash()
    }
    shouldHandleHash = true
})

function handleHash() {
    let button = doc.getElementById("href-nav")
    let location = w.location.hash.slice(1)
    if (!location.startsWith("/web/")) return
    button.setAttribute("formaction", location)
    button.click()
}

if (location.hash) {
    handleHash()
}

