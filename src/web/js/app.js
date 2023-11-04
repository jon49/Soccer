(() => {

let w = window

document.addEventListener("user-messages", e => {
    let template = document.getElementById("toast-template")
    let toasts = document.getElementById("toasts")
    for (let message of e.detail) {
        let clone = template.content.cloneNode(true)
        clone.querySelector(".message").textContent = message
        toasts.appendChild(clone)
    }
    closeDialogs()
})

document.addEventListener("hf:completed", e => {
    if (e.detail.method === "get") return
    let count = document.getElementById('get-sync-count-form')
    count.requestSubmit()
})

function closeDialogs() {
    for (let dialog of document.querySelectorAll("dialog.toast")) {
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
        document.location = document.location
        return
    }
    if (response.headers.get("content-type")?.includes("application/json")) {
        let json = await response.json()
        if (json.messages) {
            document.dispatchEvent(new CustomEvent("user-messages", {
                detail: json.messages
            }))
        }
    }
    let status = response.status
    if (status > 199 && status < 300) {
        let count = document.getElementById('sync-count')
        if (count) {
            count.innerHTML = "&#128259;"
        }
    }
}

})();
