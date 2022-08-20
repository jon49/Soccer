import { Message } from "./db";
import html from "./html-template-tag";

export function messageView(message: Message) {
    let m = <string[] | undefined>(message && typeof message === "string" ? [message] : message)
    return m?.map(x => html`<p class=error>${x}</p>`)
}

export function when<S, T>(b: S | undefined, s: (a: S) => T): T | undefined
export function when<T>(b: any, s: T): T | undefined
export function when(b: any, s: any) {
    return b
        ? (s instanceof Function ? s(b) : s)
    : typeof s === "string"
        ? ""
    : undefined
}

export function whenF<T extends any>(b: T | undefined, f: (b: T) => any) {
    return b
        ? f(b)
    : null
}
