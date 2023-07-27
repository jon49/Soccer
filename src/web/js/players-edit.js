// @ts-check

(() => {

    document.addEventListener("change", e => {
        // @ts-ignore
        let form = e.target?.form
        if (form instanceof HTMLFormElement)
            form.submit()
    })

    document.addEventListener("reset-form", e => {
        /** @type {HTMLFormElement|undefined} */
        // @ts-ignore
        let form = e.target?.form
        if (form instanceof HTMLFormElement)
            form.reset()
    })

})();
