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

window.app.anchor = (_, target) => {
  let anchorTargetId = target.dataset.anchor
  if (!anchorTargetId) return
  let el = document.querySelector(anchorTargetId)
  if (!(el instanceof HTMLElement)) return
  setAnchor(el)
}
