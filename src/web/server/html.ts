import html from "html-template-tag-stream"

export function when(condition: boolean, fn: () => any) {
    if (condition) {
        return fn()
    }
    return null
}

export default html

