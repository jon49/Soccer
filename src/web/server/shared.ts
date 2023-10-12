export function when<S, T>(b: S | undefined, s: (a: S) => T): T | undefined
export function when<T>(b: any, s: T): T | undefined
export function when(b: any, s: any) {
    return b
        ? (s instanceof Function && s.length ? s(b) : s)
    : typeof s === "string"
        ? ""
    : undefined
}

