// @ts-check

(() => {

    const times = new Map

    /**
     * @param {GameTimer} instance
     */
    function timer(instance) {
        let time = instance.interval
        if (times.get(time)?.add(instance)) return

        let m = new Set([instance])
        times.set(time, m)
        setInterval(() => {
            let o = times.get(time)
            if (!o) return
            requestAnimationFrame(() => {
                let currentTime = +new Date()
                for (let instance of o) {
                    instance.update(currentTime)
                }
            })
        }, time)
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
                    animation: 8s flash infinite;
                }
                span {
                    padding: 0.25em;
                    border-radius: 5px;
                }
                @keyframes flash {
                    0%, 50%, 100% {
                        opacity: 1;
                    }
                    25%, 75% {
                        opacity: 0;
                    }
                }
            </style>
            <span id=a></span>`
            /** @type {HTMLSpanElement} */
            // @ts-ignore
            this.a = this.root.getElementById("a")
        }

        connectedCallback() {
            this.start = +(this.dataset.timerStart ?? 0) || +new Date()
            this.total = +(this.dataset.timerTotal ?? 0)
            this.interval = +(this.dataset.timerInterval ?? 0) || 1e3
            this.a.setAttribute("class", this.hasAttribute("data-timer-flash") ? "flash" : "")
            timer(this)
            this.update(+new Date())
        }

        disconnectedCallback() {
            times.get(this.interval)?.delete(this)
        }

        /**
         * @param {number} currentTime
         */
        update(currentTime) {
            let total = this.total + (currentTime - this.start)
            let time = new Date(total)
            let seconds = (""+time.getSeconds()).padStart(2, "0")
            let minutes = (""+time.getMinutes()).padStart(2, "0")
            let hours = total/1e3/60/60|0
            this.a.textContent = `${ hours ? `${hours}:` : "" }${minutes}:${seconds}`
        }
    }

    customElements.define("game-timer", GameTimer)

})()
