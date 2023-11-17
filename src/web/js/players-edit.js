// @ts-check

((w) => {

/**
* @param {Event} e
* @returns {void}
* */
function listen(e) {
    // @ts-ignore
    let form = e.target?.form
    if (form instanceof HTMLFormElement)
        form.requestSubmit()
}

// @ts-ignore
w.app.scripts.set("/web/js/players-edit.js", {
    load() {
        document.addEventListener("change", listen)
    },
    unload() {
        document.removeEventListener("change", listen)
    }
})

})(window)
