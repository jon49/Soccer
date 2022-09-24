// @ts-check

(() => {

    const times = new Map

    /**
     * @param {GameTimer|GameTimerIs} instance
     */
    function timer(instance) {
        let time = instance.interval
        if (times.get(time)?.add(instance)) return

        let m = new Set([instance])
        times.set(time, m)
        let interval = setInterval(() => {
            if (m.size === 0) {
                times.delete(time)
                clearInterval(interval)
                return
            }
            requestAnimationFrame(() => {
                let currentTime = +new Date()
                for (let instance of m) {
                    instance.update(currentTime)
                }
            })
        }, time)
    }

    class GameTimerIs extends HTMLOptionElement {
        constructor() {
            super()

            this.start = this.total = this.interval = 0
            this.flash = false
        }

        connectedCallback() {
            this.start = +(this.dataset.start ?? 0) || +new Date()
            this.total = +(this.dataset.total ?? 0)
            this.interval = +(this.dataset.interval ?? 0) || 1e3
            this.static = this.dataset.static === ""
            if (!this.static) timer(this)
            this._observer = new MutationObserver(this._init.bind(this));
            this._observer.observe(this, { childList: true });
        }

        _init() {
            this._observer?.disconnect()
            this.a = document.createElement('span')
            this.update(+new Date())
            this.append(this.a)
        }

        disconnectedCallback() {
            times.get(this.interval)?.delete(this)
        }

        /**
         * @param {number} currentTime
         */
        update(currentTime) {
            if (this.a)
                this.a.textContent = formatTime(currentTime, this.start, this.total)
        }
    }

    class GameTimer extends HTMLElement {
        constructor() {
            super()

            this.start = this.total = this.interval = 0
            this.flash = false
            this.root = this.attachShadow({ mode: "closed" })
            this.root.innerHTML = `
            <style>
                .flash {
                    background-color: yellow;
                    animation: 2s flash infinite;
                }
                span {
                    padding: 0.25em;
                    border-radius: 5px;
                }
                @keyframes flash {
                    50% {
                        background-color: transparent;
                    }
                }
            </style>
            <span id=a></span>`
            /** @type {HTMLSpanElement} */
            // @ts-ignore
            this.a = this.root.getElementById("a")
        }

        connectedCallback() {
            this.start = +(this.dataset.start ?? 0) || +new Date()
            this.total = +(this.dataset.total ?? 0)
            this.interval = +(this.dataset.interval ?? 0) || 1e3
            this.static = this.dataset.static === ""
            this.a.setAttribute("class", this.hasAttribute("data-flash") ? "flash" : "")
            if (!this.static) timer(this)
            this.update(+new Date())
        }

        disconnectedCallback() {
            times.get(this.interval)?.delete(this)
        }

        /**
         * @param {number} currentTime
         */
        update(currentTime) {
            this.a.textContent = formatTime(currentTime, this.start, this.total)
        }
    }

    /**
     * @param {number} currentTime
     * @param {number} start
     * @param {number} total
     */
    function formatTime(currentTime, start, total) {
        let grandTotal = total + (currentTime - start)
        let time = new Date(grandTotal)
        let seconds = (""+time.getSeconds()).padStart(2, "0")
        let minutes = (""+time.getMinutes()).padStart(2, "0")
        let hours = grandTotal/1e3/60/60|0
        return `${ hours ? `${hours}:` : "" }${minutes}:${seconds}`
    }

    customElements.define("game-timer", GameTimer)
    customElements.define("game-timer-is", GameTimerIs, { extends: "option" })

})()
