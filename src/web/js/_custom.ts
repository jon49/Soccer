let w = window

let tick = setTimeout

w.defineTrait("theme", function(el) {
    tick(() => {
      let theme = el.dataset.theme;
      let docElement = document.documentElement
      theme === "" ? docElement.removeAttribute("data-theme") : docElement.setAttribute("data-theme", theme || "")
      el.remove()
    })
})

w.defineTrait("refresh", function() {tick(() => { document.location.reload() }, 500)})

w.defineTrait("redirect", function(el) {
  tick(() => { document.location.href = el.dataset.url || "/" })
})

Object.assign(w.app, {
  reset: (_, __, form) => {
    tick(() => form?.reset())
  },
  clearAutoFocus: (_, target) => {
    target.removeAttribute("autofocus")
  },
  confirm: (e, target): 1 | void => {
    if (!confirm(target.dataset.confirm)) {
      e.preventDefault()
    }
  },
  defaultTheme: (_, target) => {
    // Get system theme
    let isDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
    let theme = isDark ? "dark" : "light"
    let url = new URL((target as HTMLAnchorElement).href)
    url.searchParams.set("theme", theme)
    ;(target as HTMLAnchorElement).href = url.toString()
  },
  submit: (_, __, form) => {
    form?.requestSubmit()
  }
} as Record<string, (e: Event, el: HTMLElement, form?: HTMLFormElement) => 1 | void>)
