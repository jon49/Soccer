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

export function getProperty<T>(obj: any, prop: string) : T | undefined {
  // @ts-ignore
  if (typeof obj === "object" && prop in obj) {
    // @ts-ignore
    return obj[prop]
  }
  return
}
