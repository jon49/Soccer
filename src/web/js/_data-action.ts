for (let event of ["click", "change", "submit"]) {
  document.addEventListener(event, e => {
    let target = e.target
    let action = findAttr(target, event)
    if (!action) return

    // @ts-ignore
    handleCall(e, target, action)
  })
}

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

function isForm(element: HTMLElement): element is HTMLFormElement {
  return element.tagName === "FORM"
}

function handleCall(
  e: Event,
  target: HTMLElement,
  action: string): void {
  // @ts-ignore
  let form = isForm(target) ? target : target.form

  let actions = action.split(" ")

  for (let action of actions) {
    let fn: Function | undefined

    fn = window.app?.[action]
    if (fn) {
      fn.call(window.app, e, target, form) ?? 0
    } else {
      console.warn(`ACTION: Could not find function ${action}. Target element`, target)
    }
  }
}