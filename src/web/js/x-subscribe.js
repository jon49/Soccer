// @ts-check

(() => {

/**
* @param {CustomEvent} event
* @param {string} json
* @returns {boolean}
* */
function compare(event, json) {
    try {
        let detail = event.detail
        let match = JSON.parse(json)
        for (let key in match) {
            if (!detail) return false
            detail = detail[key]
            if (detail !== match[key]) return false
        }
        return true
    } catch (e) {
        console.error("x-subscribe could not compare values.", e)
        return false
    }
}

class XSubscribe extends HTMLFormElement {
    constructor() { super() }

    connectedCallback() {
        let event = this.dataset.event
        if (!event) return
        // @ts-ignore
        document.addEventListener(event, this.listen.bind(this))
    }

    /**
    * @param {CustomEvent} e
    * @returns {void}
    * */
    listen(e) {
        let match = this.dataset.match
        if (match) {
            if (!compare(e, match)) return
        }

        this.requestSubmit()
    }

    disconnectedCallback() {
        let event = this.dataset.event
        if (!event) return
        // @ts-ignore
        document.removeEventListener(event, this.listen.bind(this))
    }

}

customElements.define("x-subscribe", XSubscribe, { extends: "form" })

})()
