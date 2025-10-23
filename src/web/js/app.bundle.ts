import "html-traits"
// import "html-traits-on"
import "@jon49/web/x-toaster.js"
import "@jon49/web/login.js"
import "@jon49/web/app-updater.js"
import "@jon49/sw/new-app-notifier.js"
import "./_data-action.js"
import morphdom from "morphdom";

let w = window

w.htmz = function htmz(frame: HTMLIFrameElement) {
  let location = frame.contentWindow?.location
  if (location == null || location.href === "about:blank") return;

  let doc = frame.contentDocument
  if (doc == null) return
  for (let el of Array.from(doc.body.children).concat(Array.from(doc.head.children))) {
    // before, prepend, append, after
    let swap = el.getAttribute("hz-swap")
    el.removeAttribute("hz-swap")
    let targetQuery = el.getAttribute("hz-target") || el.id && `#${el.id}`
    el.removeAttribute("hz-target")
    let target = document.querySelector(targetQuery)
    if (!target) continue
    // @ts-ignore
    if (el.tagName === "TEMPLATE") el = el.content.cloneNode(true)
    if (!swap) {
      if (el.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        target.replaceWith(el)
      } else {
        // @ts-ignore
        morphdom(target, el)
      }
    } else {
      // @ts-ignore
      target[swap]?.(el)
    }
  }

  // Custom event to signal hz completed
  document.dispatchEvent(new CustomEvent("hz:completed", {}))

  frame.remove()
  document.body.appendChild(frame)
  location.replace("about:blank")
}

document.body.insertAdjacentHTML("beforeend", `<iframe hidden name=htmz onload="window.htmz(this)"></iframe>`)

customElements.define("x-theme", class extends HTMLElement {
  constructor() {
    super()
    setTimeout(() => {
      let theme = this.dataset.theme;
      let docElement = document.documentElement
      theme === "" ? docElement.removeAttribute("data-theme") : docElement.setAttribute("data-theme", theme || "")
      this.remove()
    })
  }
})

customElements.define("x-refresh", class extends HTMLElement {
constructor() {
  super()
  setTimeout(() => {
    document.location.reload()
  }, 250)
}
})

customElements.define("x-redirect", class extends HTMLElement {
  constructor() {
    super()
    setTimeout(() => {
      document.location.href = this.dataset.url || "/"
    })
  }
})

let anchor: { id?: string, offset?: number, target?: HTMLElement } = {}
document.addEventListener("submit", e => {
  let target = e.target
  if (!target || !(target instanceof HTMLElement)) return
  setAnchor(target)
})

function setAnchor(target: HTMLElement) {
  if (anchor.target) return
  anchor = { id: target.id, target, offset: target.getBoundingClientRect().top }
}

document.addEventListener("hz:completed", _ => {
  let el = anchor.target ?? document.getElementById(anchor.id || "")
  if (!el || anchor.offset == null) {
    anchor = {}
    return
  }
  window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - anchor.offset)
  anchor = {}
})

w.app = {
  reset: (e, _, form) => {
    if (e.type !== "submit") return
    setTimeout(() => form?.reset())
  },
  clearAutoFocus: (e, target) => {
    if (e.type !== "submit") return
    target.removeAttribute("autofocus")
  },
  confirm: (_, target): 1 | void => {
    if (!confirm(target.dataset.confirm || "Are you sure?")) {
      return 1
    }
  },
  anchor: (_, target) => {
    let anchorTargetId = target.dataset.anchor
    if (!anchorTargetId) return
    let el = document.querySelector(anchorTargetId)
    if (!(el instanceof HTMLElement)) return
    setAnchor(el)
  },
  defaultTheme: (_, target) => {
    if (!(target instanceof HTMLAnchorElement)) return
    // Get system theme
    let isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    let theme = isDark ? "dark" : "light"
    let url = new URL(target.href)
    url.searchParams.set("theme", theme)
    target.href = url.toString()
  },
  submit: (e, target) => {
    if (e.type !== "change") return
    // @ts-ignore
    target.requestSubmit?.() || target.form?.requestSubmit?.()
  }
}
