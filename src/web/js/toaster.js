// @ts-check

(() => {

    class XToaster extends HTMLDialogElement {
        constructor() { super() }

        connectedCallback() {
            let timeout = +(this.dataset.timeout || 3e3)
            this.timeoutId = setTimeout(() => {
                this.remove()
            }, timeout)
        }

        disconnectedCallback() {
            clearTimeout(this.timeoutId)
        }
    }

    customElements.define("x-toaster", XToaster, { extends: "dialog" })

})()
