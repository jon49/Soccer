const w = window,
    doc = document

if (w.App?.shouldSync) {
    sync()
}
if (w.App?.shouldWaitToSync) {
    // Sync every 10 minutes
    setTimeout(sync, 6e5)
}

async function sync() {
    var response =
        await fetch('/web/api/sync', {
            method: 'POST',
        })
    if (response.redirected) {
        doc.location.reload()
        return
    }
    if (response.headers.get("content-type")?.includes("application/json")) {
        let json = await response.json()
        if (json.messages) {
            doc.dispatchEvent(new CustomEvent("user-messages", {
                detail: json.messages
            }))
        }
    }
    let status = response.status
    if (status > 199 && status < 300) {
        let count = doc.getElementById('sync-count')
        if (count) {
            count.innerHTML = "&#128259;"
        }
    }
}

