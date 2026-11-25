// Putting rendered HTML into the page. Templates (html-template-tag-stream)
// render to a string; these helpers swap that string in by element id, with
// no diffing: an action names what it changes.
import { runLoads } from "./action.js";

export async function text(...views: unknown[]): Promise<string> {
  let s = "";
  for (let view of views) {
    view = await view;
    if (view == null || view === false) continue;
    if (typeof view === "string") {
      s += view;
      continue;
    }
    for await (let x of view as AsyncIterable<unknown>) if (x != null) s += x;
  }
  return s;
}

function fragment(s: string) {
  let t = document.createElement("template");
  t.innerHTML = s;
  return t.content;
}

export const $ = (id: string) => document.getElementById(id);

// Each top-level element in `views` replaces the page's element with its id.
// One that isn't on the page is left out. A <template id=x> removes #x.
// The focused element keeps focus if it's replaced by one with its id.
export async function replace(...views: unknown[]) {
  let content = fragment(await text(...views));
  let focused = document.activeElement?.id;
  for (let el of Array.from(content.children)) {
    let old = el.id ? $(el.id) : null;
    if (!old) continue;
    if (el instanceof HTMLTemplateElement) old.replaceWith(el.content);
    else old.replaceWith(el);
  }
  if (focused && document.activeElement === document.body) $(focused)?.focus();
  runLoads();
}

type Where = "beforebegin" | "afterbegin" | "beforeend" | "afterend";

async function insert(where: Where, target: string | Element | null, views: unknown[]) {
  let el = typeof target === "string" ? $(target) : target;
  if (!el) return;
  el.insertAdjacentHTML(where, await text(...views));
  runLoads();
}

export const append = (target: string | Element | null, ...views: unknown[]) =>
  insert("beforeend", target, views);
export const prepend = (target: string | Element | null, ...views: unknown[]) =>
  insert("afterbegin", target, views);
export const before = (target: string | Element | null, ...views: unknown[]) =>
  insert("beforebegin", target, views);
export const after = (target: string | Element | null, ...views: unknown[]) =>
  insert("afterend", target, views);

// The content of `target` (an id or element), replaced.
export async function fill(target: string | Element | null, ...views: unknown[]) {
  let el = typeof target === "string" ? $(target) : target;
  if (!el) return;
  el.innerHTML = await text(...views);
  runLoads();
}

export function remove(...ids: string[]) {
  for (let id of ids) $(id)?.remove();
}

// Shows each message for a few seconds (app.css styles .toast).
export function toast(...messages: string[]) {
  let box = $("toasts");
  if (!box) return;
  for (let message of messages) {
    if (!message) continue;
    let el = fragment(`<dialog class=toast open><p class=message></p></dialog>`)
      .firstElementChild as HTMLDialogElement;
    el.firstElementChild!.textContent = message;
    box.append(el);
    setTimeout(() => el.remove(), 3e3);
  }
}

