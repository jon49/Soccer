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
  // @ts-ignore
  if (!((inputs.includes(target.tagName) && (action = target.dataset.action || target.form?.dataset.action)))) return

  if (handleCall(e, target, action)) {
    e.preventDefault()
  }
})

function isForm(target: unknown): target is HTMLFormElement {
  // @ts-ignore
  return (target as HTMLElement).tagName === "FORM"
}

document.addEventListener("submit", e => {
  let target = e.target
  let action: string | undefined
  if (!((isForm(target) || isForm((target as any)?.form)) && (action = (target as any).dataset.action))) return

  if (handleCall(e, target as HTMLElement, action)) {
    e.preventDefault()
  }
})

function handleCall(
  e: Event,
  target: HTMLElement,
  action: string): number {
  // @ts-ignore
  let form = isForm(target) ? target : target.form

  let actions = action.split(" ")

  let preventDefault = 0
  for (let action of actions) {
    let fn: Function | undefined

    fn = window.app?.[action]
    if (fn) {
      fn.call(window.app, e, target, form) ?? 0
    } else {
      console.warn(`DATA-ACTION: Could not find function ${action}. Target element`, target)
    }
  }

  return preventDefault
}