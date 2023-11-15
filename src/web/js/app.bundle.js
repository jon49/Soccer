import "./_htmf-spa.js"
import "./_sync.js"

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
})

doc.addEventListener("hf:completed", e => {
    if (e.detail?.method === "get") return
    let count = doc.getElementById('get-sync-count-form')
    count.requestSubmit()
})

doc.addEventListener("app-theme", e => {
    let theme = e.detail.theme
    doc.body.classList.remove("light")
    doc.body.classList.remove("dark")
    doc.body.classList.add(theme)
})

