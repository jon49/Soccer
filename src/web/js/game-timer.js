// @ts-check

(() => {

    if (customElements.get("game-timer")) return

    class Timer {

        times = new Map()

        constructor() { }

        /**
        * @param {GameTimer} instance
        * */
        add(instance) {
            let time = instance.interval
            if (this.times.get(time)?.add(instance)) return

            let m = new Set([instance])
            this.times.set(time, m)
            let interval = setInterval(() => {
                try {
                    if (m.size === 0) {
                        this.times.delete(time)
                        clearInterval(interval)
                        return
                    }
                    requestAnimationFrame(() => {
                        let currentTime = +new Date()
                        for (let instance of m) {
                            instance.update(currentTime)
                        }
                    })
                } catch (e) {
                }
            }, time)
        }

        /**
        * @param {GameTimer} instance
        * */
        remove(instance) {
            let time = instance.interval
            let m = this.times.get(time)
            if (!m) return
            m.delete(instance)
            if (m.size === 0) this.times.delete(time)
        }
    }

    let timer = new Timer()

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
            if (!this.static) timer.add(this)
            this.update(+new Date())
        }

        disconnectedCallback() {
            timer.remove(this)
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

})()
