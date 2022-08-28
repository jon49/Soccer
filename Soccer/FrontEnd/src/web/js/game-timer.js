(() => {

    const times = new Map

    function timer(time, f, instance) {
        let o = times.get(time)
        if (o) {
            o.set(instance, f)
        } else {
            let m = new Map
            m.set(instance, f)
            times.set(time, m)
            setInterval(() => {
                let o = times.get(time)
                if (o) {
                    let currentTime = +new Date()
                    requestAnimationFrame(() => {
                        for (let f of o.values()) {
                            f(currentTime)
                        }
                    })
                }
            }, time)
        }
    }

    customElements.define("game-timer", 
        class GameTimer extends HTMLElement {
            connectedCallback() {
                this.start = +this.dataset.timerStart || +new Date()
                this.total = +this.dataset.timerTotal || 0
                this.interval = +this.dataset.timerInterval || 1e3
                let f = (currentTime) => {
                    let total = this.total + (currentTime - this.start)
                    let time = new Date(total)
                    let seconds = (""+time.getSeconds()).padStart(2, "0")
                    let minutes = (""+time.getMinutes()).padStart(2, "0")
                    let hours = total/1e3/60/60|0
                    this.textContent = `${ hours ? ""+hours+":" : "" }${minutes}:${seconds}`
                }
                timer(this.interval, f, this)
                f(+new Date())
            }
            disconnectedCallback() {
                let t = timer.get(this.interval)
                if (t) {
                    t.delete(this)
                }
            }
        }
    )

})()
