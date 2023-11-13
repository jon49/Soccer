(() => {

if (customElements.get('game-shader')) return

document.head.appendChild(document.createElement('style')).textContent = `
<style>
:root {
    --game-shader-background: #000;
    --game-shader-color: #fff;
}
.game-shader {
    background: var(--game-shader-background);
    color: var(--game-shader-color);
    padding: 0.5em;
    border-radius: 1em;
}
.game-shader a {
    color: var(--game-shader-color);
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

class GameShader extends HTMLElement {
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

        let el = this.el = this.firstElementChild
        if (!el) return
        el.classList.add('game-shader')

        this.update()
    }

    static get observedAttributes() { return ['data-total', 'data-value']; }
    attributeChangedCallback() {
        this.update()
    }

    update() {
        if (!this.el) return
        const total = this.dataset.total || 0
        if (!total) return
        const value = this.dataset.value || 0
        this.background[3] = value / total
        this.el.style.setProperty('--game-shader-background', `rgba(${this.background.join(',')})`)
        let color = invertRGBA(this.background)
        this.el.style.setProperty('--game-shader-color', `rgb(${color.join(',')})`)
    }
}

customElements.define('game-shader', GameShader)

})()
