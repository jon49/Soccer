/** @ts-check */

(() => {

    const $popUp = <HTMLElement>document.getElementById('messages')

    // https://deanhume.com/displaying-a-new-version-available-progressive-web-app/
    function shouldUpdateServiceWorker(this: ServiceWorker) {
        if (this.state === 'installed' && navigator.serviceWorker.controller) {
            console.log("State installed, initiate ask user.")
            listenToUserResponse(this)
            $popUp.appendChild(createHtml(`
                <snack-bar style="--snack-bar-duration: 20;">
                    <div class="snack-bar">
                    <p>A new version the app has been loaded. <button data-action=refresh-service-worker>Refresh</button></p>
                    </div>
                </snack-bar>`
            ))

            return true
        } else if (this.state === "activated") {
            document.location.reload()
            return true
        }
        console.log(`State incorrect "${this.state}" or controller not valid ${navigator.serviceWorker.controller}`)
        return false
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker
        .register('/web/sw.js')
        .then(reg => {
            reg.addEventListener('updatefound', () => {
                console.log("Update found.")
                let newWorker = reg.waiting || reg.installing
                if (!newWorker) return
                console.log("Initiate user input to update service worker.")
                if (!shouldUpdateServiceWorker.bind(newWorker)()) {
                    newWorker.addEventListener('statechange', shouldUpdateServiceWorker)
                }
            })
        })
    }

    function reload() {
        let refreshing = false
        navigator.serviceWorker.addEventListener('controllerchange', function () {
            console.log("Controller change.")
            if (refreshing) return
            refreshing = true
            console.log("Reload.")
            window.location.reload()
        })
    }

    function listenToUserResponse(newWorker: ServiceWorker) {
        document.addEventListener('click', e => {
            console.log("Initiate skip waiting.")
            const target = e.target
            if (!(target instanceof HTMLButtonElement) || target.dataset.action !== "refresh-service-worker") return
            const toaster = target.closest("snack-bar")
            if (toaster instanceof HTMLElement) toaster.remove()
            reload()
            console.log("Call skip waiting.")
            newWorker.postMessage({ action: 'skipWaiting' })
        })
    }

    document.addEventListener("s:error", e => {
        // @ts-ignore
        let message: string[] | undefined = e.detail.message
        if (!message) return
        let fragment = document.createDocumentFragment()
        for (let m of message) {
            fragment.appendChild(createHtml(
            `<snack-bar style="--snack-bar-duration: 3;">
                <p>${m}</p>
            </snack-bar>`))
        }
        $popUp.append(fragment)
    })

    function createHtml(s: string) {
        let template = document.createElement("template")
        template.innerHTML = s
        return template.content.children[0]
    }

    function getCleanUrl() {
        let url = new URL(document.location.href)
        url.hash = ""
        return url.toString()
    }
    window.addEventListener('beforeunload', () => {
        let active = document.activeElement
        if (!active?.id) {
            active = null
        }
        let y = window.scrollY
        let height = document.body.scrollHeight
        localStorage.pageLocation = JSON.stringify({ href: getCleanUrl(), y, height, active })
    })

    function onLoad() {
        if (document.querySelector('[autofocus]')) return
        let location = localStorage.pageLocation
        if (!location) return
        let { y, height, href } = JSON.parse(location)
        if (y && href === getCleanUrl()) {
            window.scrollTo({ top: y + document.body.scrollHeight - height })
        }
    }

    onLoad()

})();