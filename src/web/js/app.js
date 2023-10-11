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

function sync() {
    fetch('/web/api/sync', {
        method: 'POST',
    })
    .then(() => {
        let count = document.getElementById('sync-count')
        if (count) {
            count.textContent = "🖫"
        }
    })
    .catch(e => console.error(e))
}


})();
