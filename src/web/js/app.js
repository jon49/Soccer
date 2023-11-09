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

doc.addEventListener("hf:completed", e => {
    if (e.detail.method === "get") return
    let count = doc.getElementById('get-sync-count-form')
    count.requestSubmit()
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

})();
