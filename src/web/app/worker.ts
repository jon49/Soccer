// Asking the service worker (sw.ts) to do what it alone does: sync, and every
// other call to the server that needs the login token, which it refreshes
// (@jon49/web/app/worker.js).
import { call as workerCall, type Call } from "@jon49/web/app/worker.js";
import type { SyncResult } from "../data/sync.js";

export { authFetch } from "@jon49/web/app/worker.js";

export type Ops = {
  sync(): SyncResult;
  fetch(url: string, init: RequestInit): { status: number; body: string; type: string };
  deleteAccount(): number;
  deleteLocalData(): void;
};

export const call: Call<Ops> = workerCall;
