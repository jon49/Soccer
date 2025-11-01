import morphdom from "morphdom"

window.htmz = function htmz(frame: HTMLIFrameElement) {
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
    if (el.tagName === "TEMPLATE") el = el.content.cloneNode(true) as DocumentFragment
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
