/** @ts-check */

(() => {

    function createHtml(s) {
        let template = document.createElement("template")
        template.innerHTML = s
        return template.content.children[0]
    }

    document.addEventListener("s:error", e => {
        /** @type {string[]|undefined} */
        let message = e.detail.message
        if (!message) return
        const messages = document.getElementById('messages')
        if (!messages) return
        let fragment = document.createDocumentFragment()
        for (let m of message) {
            fragment.appendChild(createHtml(
            `<snack-bar style="--snack-bar-duration: 3;">
                <div class="snack-bar error">
                    <p>${m}</p>
                </div>
            </snack-bar>`))
        }
        messages.append(fragment)
    })
})();