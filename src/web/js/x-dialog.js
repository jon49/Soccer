// @ts-check

(() => {

    class XDialog extends HTMLElement {
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

            let dialog = this.firstElementChild
            if (!(dialog instanceof HTMLDialogElement)) {
                console.warn("x-dialog: first child must be a <dialog>")
                this.remove()
                return
            }

            this.dialog = dialog

            if (this.hasAttribute("show-modal") && !dialog.open) {
                dialog.showModal()
            }

            this.hasDisposed = false
            let closeEvent = this.closeEvent = this.getAttribute("close-event")
            if (closeEvent) {
                dialog.addEventListener(closeEvent, this.dispose.bind(this))
            }
            dialog.addEventListener("close", this.dispose.bind(this))
            dialog.addEventListener("click", this.outsideClickClose.bind(this))
        }

        /** @param {MouseEvent} e */
        outsideClickClose(e) {
            let dialog = this.dialog
            if (dialog?.open) {
                const dialogDimensions = dialog.getBoundingClientRect()
                if (  e.clientX < dialogDimensions.left
                   || e.clientX > dialogDimensions.right
                   || e.clientY < dialogDimensions.top
                   || e.clientY > dialogDimensions.bottom ) {
                    dialog.close()
                }
            }
        }

        dispose() {
            if (this.hasDisposed) return
            let dialog = this.dialog
            if (dialog?.open) {
                dialog.close()
            }
            this.remove()
            this.hasDisposed = true
        }

        disconnectedCallback() {
            let dialog = this.dialog
            if (this.closeEvent) {
                dialog?.removeEventListener(this.closeEvent, this.dispose.bind(this))
            }
            dialog?.removeEventListener("close", this.dispose.bind(this))
            dialog?.removeEventListener("click", this.outsideClickClose.bind(this))
        }

    }

    customElements.define("x-dialog", XDialog)

})()

