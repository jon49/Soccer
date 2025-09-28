import "html-traits"
import "html-form"
import "html-form-events"
import "html-form-scroll"
import "html-traits-on"
import "@jon49/web/x-toaster.js"
import "@jon49/web/x-dialog.js"
import "@jon49/web/user-messages.js"
import "@jon49/web/login.js"
import "@jon49/web/app-theme.js"
import "@jon49/web/app-updater.js"
import "@jon49/sw/new-app-notifier.js"

document.addEventListener("hf:completed", e => {
    // @ts-ignore
    let { form, response } = e.detail
    if (response.headers.has("hf-reset")) {
        form.reset()
    }
})
