const doc = document, w = window

for (let event of ["click", "change", "submit"]) {
  doc.addEventListener(event, e => {
    let target = e.target
    let action = findAttr(target, event)
    if (!action) return

    // @ts-ignore
    handleCall(e, target, action)
  })
}

function handleLoad() {
  for (let el of doc.querySelectorAll("[_load]")) {
    let action = el.getAttribute("_load")
    if (!action) continue
    // @ts-ignore
    handleCall(new Event("load"), el, action)
    el.removeAttribute("_load")
  }
}

doc.addEventListener("hz:completed", handleLoad)
w.addEventListener("load", handleLoad)

function findAttr(target: EventTarget | null, attr: string): string | null | undefined {
  if (!target) return
  // @ts-ignore
  let result = target?.closest?.(`[_${attr}]`)?.getAttribute(`_${attr}`)
  if (!result) {
    // @ts-ignore
    return findAttr(target?.form, attr)
  }
  return result
}

function handleCall(
  e: Event,
  target: HTMLElement,
  action: string): void {
  // @ts-ignore
  let form = target.tagName === "FORM" ? target : target.form

  let actions = action.split(" ")

  for (let action of actions) {
    let fn: Function | undefined

    fn = w.app?.[action]
    if (fn) {
      fn.call(w.app, e, target, form) ?? 0
    } else {
      console.warn(`ACTION: Could not find function ${action}. Target element`, target)
    }
  }
}