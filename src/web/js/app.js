(() => {

for (let dialog of document.querySelectorAll('dialog.toast')) {
    let id = setTimeout(() => {
        dialog.remove()
        clearTimeout(id)
    }, (dialog.dataset.timeout || 3) * 1e3)
}

})();
