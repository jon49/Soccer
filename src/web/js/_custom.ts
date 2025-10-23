let w = window

w.defineTrait("theme", function(el) {
    setTimeout(() => {
      let theme = el.dataset.theme;
      let docElement = document.documentElement
      theme === "" ? docElement.removeAttribute("data-theme") : docElement.setAttribute("data-theme", theme || "")
      el.remove()
    })
})

w.defineTrait("refresh", function() {setTimeout(() => { document.location.reload() }, 250)})

w.defineTrait("redirect", function(el) {
  setTimeout(() => { document.location.href = el.dataset.url || "/" })
})

Object.assign(w.app, {
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
} as Record<string, (e: Event, el: HTMLElement, form?: HTMLFormElement) => 1 | void>)
