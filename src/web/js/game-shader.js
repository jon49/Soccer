(() => {

document.head.appendChild(document.createElement('style')).textContent = `
<style>
:root {
    --position-shader-background: #000;
    --position-shader-color: #fff;
}
.position-shader {
    background: var(--position-shader-background);
    color: var(--position-shader-color);
}
</style>`

function getRGB(el, prop) {
    let computed = window.getComputedStyle(el, null)[prop]
    let s = computed.slice(computed.indexOf('(') + 1, computed.indexOf(')'))
    let rgb = s.split(',').map(x => parseInt(x))
    return rgb
}

function calcInversion(color, alpha) {
    if (alpha >= .4) return 255 - color
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

        this.background = invert(getRGB(document.body, 'backgroundColor'))

        this.el = this.firstElementChild
        this.el.classList.add('position-shader')

        this.update()
    }

    static get observedAttributes() { return ['data-total', 'data-value']; }
    attributeChangedCallback() {
        this.update()
    }

    update() {
        if (!this.el) return
        const total = this.dataset.total || 1
        const value = this.dataset.value || 0
        this.background[3] = value / total
        this.el.style.setProperty('--position-shader-background', `rgba(${this.background.join(',')})`)
        let color = invertRGBA(this.background)
        this.el.style.setProperty('--position-shader-color', `rgb(${color.join(',')})`)
    }
}

customElements.define('position-shader', PositionShader)

})()
