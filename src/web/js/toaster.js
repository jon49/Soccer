// @ts-check

(() => {

    if (customElements.get("user-message")) return

    class UserMessage extends HTMLElement {
        constructor() {
            super()
        }

        connectedCallback() {
            if (this.children.length) {
                this._init()
            }

            // not yet available, watch it for _init
            this._observer = new MutationObserver(this._init.bind(this))
            this._observer.observe(this, { childList: true })
        }

        _init() {
            this._observer?.disconnect()
            this._observer = null

            let timeout = +(this.dataset.timeout || 3e3)
            setTimeout(() => {
                this.remove()
            }, timeout)
        }
    }

    customElements.define("user-message", UserMessage)

})()
