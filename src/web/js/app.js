(() => {

for (let dialog of document.querySelectorAll('dialog.toast')) {
    let id = setTimeout(() => {
        dialog.remove()
        clearTimeout(id)
    }, (dialog.dataset.timeout || 3) * 1e3)
}

if (App?.shouldSync) {
    sync()
}
if (App?.shouldWaitToSync) {
    // Sync every 10 minutes
    setTimeout(sync, 6e5)
}

function sync() {
    fetch('/web/api/sync', {
        method: 'POST',
    })
    .then(() => {
        let count = document.getElementById('sync-count')
        if (count) {
            count.textContent = "🖫"
        }
    })
    .catch(e => console.error(e))
}


})();
