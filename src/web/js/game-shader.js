(() => {

function getRGB(el, prop) {
    let computed = window.getComputedStyle(el, null)[prop]
    let s = computed.slice(computed.indexOf('(') + 1, computed.indexOf(')'))
    let rgb = s.split(',').map(x => parseInt(x))
    return rgb
}

function calcInversion(color, alpha) {
    if (alpha >= .5) return 255 - color
    return color
}

function invertRGBA(rgba) {
    let [r, g, b, a] = rgba
    return [calcInversion(r, a), calcInversion(g, a), calcInversion(b, a)]
}

function invert(array) {
    array.length = 3
    return array.map(x => 255 - x)
}

class PositionShader extends HTMLElement {
    constructor() {
        super()
    }
    connectedCallback() {
        if (this.children.length) {
            this._init()
        }

        // not yet available, watch it for init
        this._observer = new MutationObserver(this._init.bind(this))
        this._observer.observe(this, { childList: true })
    }

    _init() {
        this._observer?.disconnect()
        this._observer = null
        let el = this.firstElementChild
        this.el = el
        el.classList.add("position-shader")
        this.background = invert(getRGB(el, 'backgroundColor'))
        this.update()
    }

    static get observedAttributes() { return ['data-total', 'data-value']; }
    attributeChangedCallback() {
        this.update()
    }

    update() {
        if (!this.el) return
        const total = this.dataset.total || 0
        const value = this.dataset.value || 0
        const percent = Math.floor(value / total * 100)
        this.background[3] = percent / 100
        this.el.style.setProperty('--background-shade', `rgba(${this.background.join(',')})`)
        let color = invertRGBA(this.background)
        this.el.style.setProperty('--text-shade-color', `rgb(${color.join(',')})`)
    }

}

customElements.define('position-shader', PositionShader)

})()
