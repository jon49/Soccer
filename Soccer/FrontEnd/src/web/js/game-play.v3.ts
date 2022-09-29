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

    document.addEventListener('hf:redirected', e => {
        // @ts-ignore
        let form = e.detail?.form
        if (form?.method === 'post' && form.id !== 'sync-form') {
            e.preventDefault()
            let refresh = document.getElementById('refresh-form')
            if (refresh instanceof HTMLFormElement)
                refresh.requestSubmit()
        }
    })
})()
