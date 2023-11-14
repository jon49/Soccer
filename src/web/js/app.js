(() => {

const w = window,
    doc = document

navigator.serviceWorker.addEventListener('controllerchange', () => {
  w.location.reload()
})

doc.addEventListener("user-messages", e => {
    let template = doc.getElementById("toast-template")
    let toasts = doc.getElementById("toasts")
    for (let message of e.detail) {
        let clone = template.content.cloneNode(true)
        clone.querySelector(".message").textContent = message
        toasts.appendChild(clone)
    }
    closeDialogs()
})

doc.addEventListener("hf:beforeRequest", e => {
    let detail = e.detail
    if (detail.method === "get" && detail.form.id === "href") {
        let dispose = w.app.dispose
        while (dispose.length > 0) {
            dispose.pop()()
        }
    }
})

let shouldHandleHash = true
doc.addEventListener("hf:completed", e => {
    let detail = e.detail
    if (detail.method === "get") {
        if (detail.form.id === "href" && detail.submitter?.id !== "href-nav") {
            let url = new URL(detail?.submitter?.formAction ?? detail.form.action)
            shouldHandleHash = false
            location.hash = url.pathname + url.search
        }
        closeDialogs()
        return
    }
    let count = doc.getElementById('get-sync-count-form')
    count.requestSubmit()
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

doc.addEventListener("app-theme", e => {
    let theme = e.detail.theme
    doc.body.classList.remove("light")
    doc.body.classList.remove("dark")
    doc.body.classList.add(theme)
})

function closeDialogs() {
    for (let dialog of doc.querySelectorAll("dialog.toast")) {
        let id = setTimeout(() => {
            dialog.remove()
            clearTimeout(id)
        }, (dialog.dataset.timeout || 3) * 1e3)
    }
}

closeDialogs()

if (w.App?.shouldSync) {
    sync()
}
if (w.App?.shouldWaitToSync) {
    // Sync every 10 minutes
    setTimeout(sync, 6e5)
}

async function sync() {
    var response =
        await fetch('/web/api/sync', {
            method: 'POST',
        })
    if (response.redirected) {
        doc.location.reload()
        return
    }
    if (response.headers.get("content-type")?.includes("application/json")) {
        let json = await response.json()
        if (json.messages) {
            doc.dispatchEvent(new CustomEvent("user-messages", {
                detail: json.messages
            }))
        }
    }
    let status = response.status
    if (status > 199 && status < 300) {
        let count = doc.getElementById('sync-count')
        if (count) {
            count.innerHTML = "&#128259;"
        }
    }
}

function handleHash() {
    let button = doc.getElementById("href-nav")
    button.setAttribute("formaction", location.hash.slice(1))
    button.click()
}

if (location.hash) {
    handleHash()
}

})();
