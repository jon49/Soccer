document.addEventListener('focus', e => {
    let target = e.target
    if ((target instanceof HTMLInputElement
        || target instanceof HTMLSelectElement)
        && target.dataset.focusClick === '')
        target.click()
}, { capture: true })
