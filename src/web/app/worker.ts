// Asking the service worker to do what it alone does: sync, and every other
// call to the server that needs the login token, which it refreshes. One
// worker serves every tab, and it runs these one at a time (sw.ts), so two
// can't refresh the token or sync at once.
import type { SyncResult } from "../data/sync.js";

export interface Ops {
  sync(): SyncResult;
  fetch(url: string, init: RequestInit): { status: number; body: string; type: string };
  deleteAccount(): number;
  deleteLocalData(): void;
}

export async function call<K extends keyof Ops>(
  op: K,
  ...args: Parameters<Ops[K]>
): Promise<ReturnType<Ops[K]>> {
  let registration = await navigator.serviceWorker.ready;
  let worker = registration.active!;
  return new Promise((resolve, reject) => {
    let { port1, port2 } = new MessageChannel();
    port1.onmessage = (e) => {
      port1.close();
      if ("error" in e.data) reject(e.data.error);
      else resolve(e.data.result);
    };
    worker.postMessage({ op, args }, [port2]);
  });
}

// authFetch (data/api-client.ts), run by the worker. A network error comes
// back as status 0, as Response.error().
export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let { headers, ...rest } = init;
  let res = await call("fetch", url, {
    ...rest,
    headers: Object.fromEntries(new Headers(headers)),
  });
  if (res.status === 0) return Response.error();
  return new Response(res.status === 204 || res.status === 304 ? null : res.body, {
    status: res.status,
    headers: { "content-type": res.type },
  });
}
