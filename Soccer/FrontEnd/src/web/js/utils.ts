export const isSelected =
    <T extends string>(currentValue: string|undefined) =>
    (value: T) => value === currentValue ? "selected" : null

const searchParamsHandler = {
  get(obj: any, prop: string) {
    if (prop === "_url") {
      return obj
    }
    return obj.searchParams.get(prop)
  }
}

export function searchParams<TReturn>(req: Request) : TReturn & {_url: URL} {
  let url = new URL(req.url)
  return new Proxy(url, searchParamsHandler)
}

export function cleanHtmlId(s: string) {
  return s.replace(/[\W_-]/g,'-');
}
