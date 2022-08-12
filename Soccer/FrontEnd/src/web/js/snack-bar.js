// @ts-check

(function() {
    // See https://www.w3schools.com/howto/howto_js_snackbar.asp
    if (!document.getElementById("snack-bar-css")) {
        const $style = document.createElement("style")
        $style.setAttribute("id", "snack-bar-css")
        $style.innerHTML = `
        snack-bar.hide-snack-bar {
            visibility: hidden;
            min-width: 250px;
            text-align: center;
            z-index: 1;
        }
        snack-bar.show {
            visibility: visible;
            -webkit-animation: fadein 0.5s, fadeout 0.5s var(--snack-bar-duration)s;
            animation: fadein 0.5s, fadeout 0.5s var(--snack-bar-duration)s;
        }
        @-webkit-keyframes fadein {
            from {bottom: 0; opacity: 0;}
            to {bottom: 30px; opacity: 1;}
        }
        @keyframes fadein {
            from {bottom: 0; opacity: 0;}
            to {bottom: 30px; opacity: 1;}
        }
        @-webkit-keyframes fadeout {
            from {bottom: 30px; opacity: 1;}
            to {bottom: 0; opacity: 0;}
        }
        @keyframes fadeout {
            from {bottom: 30px; opacity: 1;}
            to {bottom: 0; opacity: 0;}
        }
        fieldset[data-tab] {
            margin-top: 3px;
        }
        `
        document.head.append($style)
    }

    /**
     * @param {HTMLElement} el 
     * @returns number
     */
    function getSnackBarDuration(el) {
        return +getComputedStyle(el).getPropertyValue('--snack-bar-duration')
    }

    // Also known as "Toast" and "Snackbar"
    class Snackbar extends HTMLElement {
        constructor() {
            super()
            const shadowRoot = this.attachShadow({mode: 'open'})
            shadowRoot.innerHTML = `<slot name="message"><p>I love cheeseburgers!</p></slot>`
        }

        connectedCallback() {
            this.classList.add("hide-snack-bar")
            const timeout = (getSnackBarDuration(this) || getSnackBarDuration(document.documentElement) || 3) + 0.5
            setTimeout(() => {
                this.remove()
            } , timeout * 1e3)
        }
    }

    customElements.define("snack-bar", Snackbar)
})()
