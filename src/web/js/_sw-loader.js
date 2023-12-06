// https://deanhume.com/displaying-a-new-version-available-progressive-web-app/
let refreshing;
// The event listener that is fired when the service worker updates
// Here we reload the page
navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (refreshing) return;
    window.location.reload();
    refreshing = true;
});

let newWorker;

if ('serviceWorker' in navigator) {
    // Register the service worker
    navigator.serviceWorker.register('/web/sw.js').then(reg => {
        if ((newWorker = reg.waiting)?.state === 'installed') {
            notifyUserAboutNewVersion("waiting")
            return
        }
        reg.addEventListener('updatefound', () => {
            // An updated service worker has appeared in reg.installing!
            newWorker = reg.installing

            newWorker.addEventListener('statechange', () => {

                // There is a new service worker available, show the notification
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage("installed")
                    notifyUserAboutNewVersion()
                }

            })
        })
    })
}

function notifyUserAboutNewVersion(state = "") {
    let nav = document.getElementById("top-nav")
    nav.insertAdjacentHTML("afterbegin", `<div class=inline><a id=new-worker href="#">Click here to update your app.</a></div>`)
    let newWorkerLink = document.getElementById("new-worker")
    function handleUpdateClick(e) {
        e.preventDefault()
        newWorker.postMessage({ action: 'skipWaiting' })
        newWorkerLink.remove()
    }
    newWorkerLink.addEventListener("click", handleUpdateClick)
    if (state === "waiting") return
    // Publish custom event for "user-messages" to display a toast.
    document.dispatchEvent(new CustomEvent("user-messages", {
        detail: ["A new version of the app is available. Click the link in the top right to update."]
    }))
}

