// @ts-check

((w) => {

// @ts-ignore
w.app.dispose.push(() => {
    document.removeEventListener("change", listen)
})

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

document.addEventListener("change", listen)

})(window)
