(() => {

document.addEventListener('submit', async e => {
    e.preventDefault()
    const form = e.target
    let response = await fetch(form.action, {
        method: form.method,
        body: new FormData(form)
    })
    let data = await response.json()
    if (response.ok) {
        location.href = "/web/?login=success"
        return
    }
    if (data.msg) {
        alert(data.msg)
    }
})

})()

