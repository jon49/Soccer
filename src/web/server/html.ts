import html from "html-template-tag-stream"

export function when(condition: any, fn: (() => any) | string) {
    if (!!condition) {
        if (typeof fn === "string") {
            return fn
        }
        return fn()
    }
    return null
}

export default html

