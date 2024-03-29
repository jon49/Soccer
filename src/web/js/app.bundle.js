import "html-form"
import "form-subscribe"
import "@jon49/web/html-form-spa.js"
import "./_sw-loader.js"
import "@jon49/web/x-dialog.js"
import "@jon49/web/x-toaster.js"

const w = window,
    doc = document

doc.addEventListener("user-messages", e => {
    let template = doc.getElementById("toast-template")
    let toasts = doc.getElementById("toasts")
    for (let message of e.detail) {
        let clone = template.content.cloneNode(true)
        let wordCount = message.split(" ").length
        clone.firstElementChild.setAttribute("data-timeout", 1e3 + wordCount * 400)
        clone.querySelector(".message").textContent = message
        toasts.appendChild(clone)
    }
})

doc.addEventListener("app-theme", e => {
    let theme = e.detail.theme
    doc.body.classList.remove("light")
    doc.body.classList.remove("dark")
    doc.body.classList.add(theme)
})

