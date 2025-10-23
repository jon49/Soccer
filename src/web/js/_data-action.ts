let allowedElements = ["A", "BUTTON"]
document.addEventListener("click", e => {
  let target = e.target as HTMLElement
  let action: string | undefined
  if (!allowedElements.includes(target.tagName) || !(action = target.dataset.action)) return

  if (handleCall(e, target, action)) {
    e.preventDefault()
  }
})

let inputs = ["INPUT", "TEXTAREA", "SELECT", "FORM"]
document.addEventListener("change", e => {
  let target = e.target as HTMLElement
  let action: string | undefined
  if (!((inputs.includes(target.tagName) && (action = target.dataset.action)))) return

  if (handleCall(e, target, action)) {
    e.preventDefault()
  }
})

function isForm(target: unknown): target is HTMLFormElement {
  return target instanceof HTMLFormElement
}

document.addEventListener("submit", e => {
  let target = e.target
  let action: string | undefined
  if (!((isForm(target) || isForm((target as any)?.form)) && (action = (target as any).dataset.action))) return

  if (handleCall(e, target as HTMLElement, action)) {
    e.preventDefault()
  }
})

window.dataAction = function dataAction(e: Event) {
  const target = e.target as HTMLElement | null
  let action: string | undefined
  if (!(target instanceof HTMLElement && (action = target.dataset.action))) return

  if (handleCall(e, target, action)) {
    e.preventDefault()
  }
}

function handleCall(
  e: Event,
  target: HTMLElement,
  action: string): number {
  // @ts-ignore
  let form = target instanceof HTMLFormElement ? target : target.form

  let actions = action.split(" ")

  let preventDefault = 0
  for (let action of actions) {
    let fn: Function | undefined // = target.app?.[action]
    // if (fn) {
    //   preventDefault = fn.call(target.app, e, target, form) ?? 0
    // }

    // let root = target.closest("[data-root]")

    // fn = root?.app?.[action]
    // if (fn && root?.app) {
    //   preventDefault = fn.call(root.app, e, target, form) ?? 0
    // }

    fn = window.app?.[action]
    if (fn) {
      preventDefault = fn.call(window.app, e, target, form) ?? 0
    }

    if (preventDefault) return preventDefault
    if (preventDefault == null) console.warn(`DATA-ACTION: Could not find function ${action}. Target element`, target)
  }

  return preventDefault
}