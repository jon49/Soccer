document.head.appendChild(document.createElement('style')).textContent = `
<style>
:root {
    --game-shader-background: #000;
    --game-shader-color: #fff;
}
.game-shader {
    background: var(--game-shader-background);
    color: var(--game-shader-color);
    border-radius: 5px;
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

class GameShader {
    /**
     * @param {HTMLButtonElement} el 
     */
    constructor(el) {
        if (!(el instanceof HTMLElement)) console.error('Invalid element type', el)
        this.background = invert(getRGB(document.body, 'backgroundColor'))

        this.el = el
        el.classList.add('game-shader')
        el.classList.add('outline')

        this.update()
    }

    static get observedAttributes() { return ['data-total', 'data-value']; }
    attributeChangedCallback() {
        this.update()
    }

    update() {
        let el = this.el
        if (!el) return
        const total = el.dataset.total || 0
        if (!+total) return
        const value = el.dataset.value || 0
        this.background[3] = value / total
        el.style.setProperty('--game-shader-background', `rgba(${this.background.join(',')})`)
        let color = invertRGBA(this.background)
        el.style.setProperty('--game-shader-color', `rgb(${color.join(',')})`)
    }
}

window.defineTrait('game-shader', GameShader)
