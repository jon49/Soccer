import html from "html-template-tag-stream"

function when<T>(condition: T | undefined, fn: ((arg0: T) => any)) : string | number | AsyncGenerator<any, void, unknown> | null
function when(condition: any, s: string) : string | null
function when(condition: any, fn: any) {
    if (!!condition) {
        if (typeof fn === "string") {
            return fn
        }
        return fn(condition)
    }
    return null
}

export { when }

export default html

