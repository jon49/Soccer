// The `_action` dispatcher, as in ~/r/timer/src/_action: an element names
// what it does with an attribute, `_click=swap`, `_change=editTeam`,
// `_submit=addPlayer`, and the dispatcher calls that function. It looks for it
// on the element's `app`, then on the nearest `[data-root]`'s `app` (the
// router puts the page's actions on <main data-root>), then on `window.app`.
// Several names, space separated, run in order.
//
// Actions run one at a time, in the order they were asked for: one that reads
// and saves a record finishes before the next one reads it. An action marked
// `immediate` instead runs as the event fires, so it can stop the event: a
// `confirm` that's declined calls preventDefault, which also stops the
// actions after it and the form's submit.
//
// `_load=x` runs x once for each element that has it, when it shows up on the
// page. If x returns { disconnectedCallback }, that runs once the element is
// gone.
import type { Action, ActionContext, Actions, Query } from "./page.js";

declare global {
  interface Window {
    app: Actions;
  }
  interface Element {
    app?: Actions;
  }
}

window.app = window.app || {};

const immediateActions = new WeakSet<Action>();

export function immediate<T extends Action>(fn: T): T {
  immediateActions.add(fn);
  return fn;
}

// Called after each action that wasn't immediate: shows its messages, and
// tells anyone waiting (the e2e tests, tasks/measure-speed.sh) that it's
// done, and when it started and finished.
function done(name: string, result: unknown, started: number) {
  let messages = Array.isArray(result) ? result : typeof result === "string" ? [result] : [];
  if (messages.length) toast(...messages);
  let detail = { action: name, started, finished: performance.now() };
  document.dispatchEvent(new CustomEvent("app:done", { detail }));
}

let toast: (...messages: string[]) => void = (...x) => console.log(...x);
export function setToast(f: typeof toast) {
  toast = f;
}

// What a validator or an action rejects with: a message, a list of them, or
// an Error. Anything else is a bug.
function failed(name: string, e: unknown) {
  if (typeof e === "string") e = [e];
  if (Array.isArray(e)) {
    // promise-validation rejects with a list, nested for nested validations.
    let list = (e as unknown[]).flat(Infinity);
    toast(...list.map((x: any) => (typeof x === "string" ? x : (x?.message ?? String(x)))));
  } else {
    console.error(`Action "${name}" failed:`, e);
    toast("Oops something happened which shouldn't have!");
  }
  document.dispatchEvent(new CustomEvent("app:done", { detail: { action: name, failed: true } }));
}

let queue: Promise<unknown> = Promise.resolve();

// Runs `f` after every action already asked for.
export function enqueue<T>(f: () => T | Promise<T>): Promise<T> {
  let result = queue.then(f);
  queue = result.catch(() => {});
  return result;
}

// Runs action `fn` in the queue, then reports it.
function queued(name: string, fn: Action, ctx: ActionContext) {
  let started = 0;
  enqueue(() => {
    started = performance.now();
    return fn(ctx);
  }).then(
    (x) => done(name, x, started),
    (e) => failed(name, e),
  );
}

function find(el: Element, name: string): Action | undefined {
  return (
    el.app?.[name] ?? (el.closest("[data-root]") as Element | null)?.app?.[name] ?? window.app[name]
  );
}

function formData(form: HTMLFormElement | undefined, submitter: HTMLElement | undefined) {
  let o: Record<string, any> = {};
  if (!form) return o;
  let data: FormData;
  try {
    data = new FormData(form, submitter);
  } catch {
    // `submitter` isn't one of this form's submit buttons.
    data = new FormData(form);
  }
  for (let [key, value] of data.entries()) {
    if (key.endsWith("[]")) {
      key = key.slice(0, -2);
      (o[key] ??= []).push(value);
    } else {
      o[key] = value;
    }
  }
  return o;
}

function query(...els: (HTMLElement | undefined)[]): Query {
  let q: Query = Object.fromEntries(new URL(location.href).searchParams);
  for (let el of els) if (el) Object.assign(q, el.dataset);
  return q;
}

function context(ev: Event, el: HTMLElement): ActionContext {
  let form =
    el instanceof HTMLFormElement
      ? el
      : ((el as HTMLInputElement).form ?? el.closest("form") ?? undefined);
  let submitter =
    ev instanceof SubmitEvent && ev.submitter instanceof HTMLElement
      ? ev.submitter
      : el instanceof HTMLButtonElement
        ? el
        : undefined;
  return {
    ev,
    el,
    form: form ?? undefined,
    submitter,
    query: query(form ?? undefined, el, submitter),
    data: formData(form ?? undefined, submitter),
  };
}

export function run(names: string, ev: Event, el: HTMLElement) {
  let ctx: ActionContext | undefined;
  let anyQueued = false;
  for (let name of names.split(" ")) {
    if (!name) continue;
    let fn = find(el, name);
    if (!fn) {
      console.warn(`ACTION: Could not find function ${name}. Target element`, el);
      continue;
    }
    ctx ??= context(ev, el);
    let c = ctx;
    if (immediateActions.has(fn)) {
      fn(c);
      if (ev.defaultPrevented && ev.type !== "submit") return;
    } else {
      queued(name, fn, c);
      anyQueued = true;
    }
  }
  if (anyQueued && ev.type === "submit") keepInPlace(ctx!.form ?? el);
}

// After a form's actions, scrolls the page by however far the form moved, so
// it's back where it was on the screen: a player added above the Add a player
// form pushes the page up instead of pushing the form down. (@jon49/web's
// anchor.js did this before the rewrite.) Skipped if the page changed.
function keepInPlace(form: HTMLElement) {
  let { id } = form,
    top = form.getBoundingClientRect().top,
    url = location.href;
  enqueue(() => {
    if (location.href !== url) return;
    let el = form.isConnected ? form : id ? document.getElementById(id) : null;
    if (el) window.scrollBy(0, el.getBoundingClientRect().top - top);
  });
}

// Runs the action `name` as if `el` named it, with `params` added to its
// query: for code that decides what a tap does itself (match-select.js).
export function dispatch(name: string, el: HTMLElement, params: Record<string, string> = {}) {
  let fn = find(el, name);
  if (!fn) {
    console.warn(`ACTION: Could not find function ${name}. Target element`, el);
    return;
  }
  let ctx = context(new Event("dispatch"), el);
  Object.assign(ctx.query, params);
  queued(name, fn, ctx);
}

function owner(target: EventTarget | null, type: string): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  let el = target.closest<HTMLElement>(`[_${type}]`);
  if (el) return el;
  // An input whose form names the action from outside it (form=id).
  let form = (target as HTMLInputElement).form;
  return form?.hasAttribute(`_${type}`) ? form : null;
}

for (let type of ["click", "change", "input", "submit"]) {
  document.addEventListener(type, (ev) => {
    if (type === "submit") ev.preventDefault();
    let el = owner(ev.target, type);
    if (!el) {
      if (type === "submit")
        console.warn("A form was submitted with no _submit action.", ev.target);
      return;
    }
    run(el.getAttribute(`_${type}`)!, ev, el);
  });
}

/*** _load ***/

interface Disconnectable {
  disconnectedCallback: () => void;
}

let components = new Map<Element, Disconnectable>();

function sweep() {
  for (let [el, component] of components) {
    if (el.isConnected) continue;
    components.delete(el);
    component.disconnectedCallback();
  }
}

new MutationObserver(() => components.size && sweep()).observe(document.documentElement, {
  childList: true,
  subtree: true,
});

// Runs the `_load` actions of elements that haven't had them yet, taking the
// attribute off so they run once.
export function runLoads() {
  for (let el of document.querySelectorAll<HTMLElement>("[_load]")) {
    let names = el.getAttribute("_load")!;
    el.removeAttribute("_load");
    for (let name of names.split(" ")) {
      if (!name) continue;
      let fn = find(el, name);
      if (!fn) {
        console.warn(`ACTION: Could not find function ${name}. Target element`, el);
        continue;
      }
      let result = fn(context(new Event("load"), el)) as Partial<Disconnectable> | undefined;
      if (result?.disconnectedCallback) components.set(el, result as Disconnectable);
    }
  }
}
