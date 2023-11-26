// @ts-check
// @ts-ignore
import debounce from "underscore/modules/debounce.js"

/**
* @param {any} base
* @param {any} other
* @returns {boolean}
* */
function compareObjects(base, other) {
    for (let key in base) {
        if (base.hasOwnProperty(key)) {
            if (typeof base[key] === 'object' && base[key] !== null && other[key]) {
                if (!compareObjects(base[key], other[key])) {
                    return false
                }
            } else if (base[key] !== other[key]) {
                return false
            }
        }
    }
    return true
}

/**
* @param {CustomEvent} event
* @param {string} json
* @returns {boolean}
* */
function compare(event, json) {
    try {
        let detail = event.detail
        let match = JSON.parse(json)
        return compareObjects(match, detail)
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
        let debounceInterval = +(this.dataset.debounce || 0)
        if (debounceInterval) {
            this.debouncedListen = debounce(this.listen.bind(this), debounceInterval)
            document.addEventListener(event, this.debouncedListen)
        } else {
            // @ts-ignore
            document.addEventListener(event, this.listen.bind(this))
        }
        if (this.dataset.immediate === "true") {
            this.requestSubmit()
        }
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

        let notMatch = this.dataset.matchNot
        if (notMatch) {
            if (compare(e, notMatch)) return
        }

        if (this.dataset.action) {
            let action = new Function("event", this.dataset.action)
            action(e)
        } else {
            this.requestSubmit()
        }
    }

    disconnectedCallback() {
        let event = this.dataset.event
        if (!event) return
        if (this.debouncedListen) {
            document.removeEventListener(event, this.debouncedListen)
        } else {
            // @ts-ignore
            document.removeEventListener(event, this.listen.bind(this))
        }
    }

}

customElements.define("x-subscribe", XSubscribe, { extends: "form" })

