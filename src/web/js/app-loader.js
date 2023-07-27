"use strict";
(async () => {
    if ('serviceWorker' in navigator) {
        let registration = await navigator.serviceWorker.register(`/web/sw.js`)
        registration.installing.addEventListener('statechange', event => {
            if (event.target.state === 'installed') {
                console.log("Service worker registered.")
                setTimeout(() => {
                    document.location.reload()
                }, 100)
            }
        })
    } else {
        alert("Service worker is not supported. Please use a modern browser.")
    }
})()

