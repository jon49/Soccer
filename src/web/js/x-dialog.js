// @ts-check

(() => {

    class XDialog extends HTMLDialogElement {
        constructor() { super() }

        connectedCallback() {
            if (this.children.length) {
                this.init()
                return
            }

            // not yet available, watch it for _init
            this.observer = new MutationObserver(this.init.bind(this))
            this.observer.observe(this, { childList: true })
        }

        init() {
            this.observer?.disconnect()
            this.observer = null

            if (this.hasAttribute("show-modal") && !this.open) {
                this.showModal()
            }

            this.hasDisposed = false
            let closeEvent = this.closeEvent = this.getAttribute("close-event")
            if (closeEvent) {
                this.addEventListener(closeEvent, this.dispose.bind(this))
            }
            this.addEventListener("close", this.dispose.bind(this))
            this.addEventListener("click", this.outsideClickClose.bind(this))
        }

        /** @param {MouseEvent} e */
        outsideClickClose(e) {
            if (this?.open) {
                const dialogDimensions = this.getBoundingClientRect()
                if (  e.clientX < dialogDimensions.left
                   || e.clientX > dialogDimensions.right
                   || e.clientY < dialogDimensions.top
                   || e.clientY > dialogDimensions.bottom ) {
                    this.close()
                }
            }
        }

        dispose() {
            if (this.hasDisposed) return
            if (this?.open) {
                this.close()
            }
            this.remove()
            this.hasDisposed = true
        }

        disconnectedCallback() {
            if (this.closeEvent) {
                this?.removeEventListener(this.closeEvent, this.dispose.bind(this))
            }
            this?.removeEventListener("close", this.dispose.bind(this))
            this?.removeEventListener("click", this.outsideClickClose.bind(this))
        }

    }

    customElements.define("x-dialog", XDialog, { extends: "dialog" })

})()

