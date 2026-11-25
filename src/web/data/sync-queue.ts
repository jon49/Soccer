// The service worker's queue: sync and every call to the server run one at a
// time (sw.ts).

let running: Promise<unknown> = Promise.resolve();

// afterSync runs `f` once the sync in flight (if any) is done, and holds
// back any sync asked for meanwhile until `f` is done too.
export function afterSync<T>(f: () => Promise<T>): Promise<T> {
  let result = running.then(f, f);
  running = result.catch(() => {});
  return result;
}
