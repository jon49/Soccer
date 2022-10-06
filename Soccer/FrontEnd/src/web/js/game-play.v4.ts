(() => {
    function toggleButtonClass(add: boolean) {
        return (e: FocusEvent) => {
            let target = e.target
            if (target instanceof HTMLSelectElement && target.classList?.contains('auto-select')) {
                target.classList[add ? 'add' : 'remove']('button')
            }
        }
    }
    let capture = { capture: true }
    document.addEventListener('focus', toggleButtonClass(false), capture)
    document.addEventListener('blur', toggleButtonClass(true), capture)

})()
