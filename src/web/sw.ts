/// <reference lib="webworker" />
// The service worker (@jon49/sw/app-worker.js, shared with ../weight):
//
// 1. Keeps the app's files, so it opens offline. The build (vite.config.ts)
//    fills in __FILES__, every file it emits, and __VERSION__, a hash of them.
// 2. Answers a move to any page of the app (/web/teams, /web/match?...) with
//    the app shell, /web/index.html, which renders the page itself.
// 3. Syncs, and makes every other call to the server that needs the login
//    token (its built-in "fetch"), when a page asks (app/worker.ts). It runs
//    these one at a time, for every tab, so two can't refresh the token at
//    once or sync over each other.
//
// In development (npm start) the build fills in nothing: Vite serves every
// file and page, and the worker only does (3).
import { startAppWorker } from "@jon49/sw/app-worker.js";
import { deleteAccount, deleteLocalData } from "./data/account.js";
import sync from "./data/sync.js";

declare const __FILES__: string[];
declare const __VERSION__: string;

startAppWorker({
  name: "soccer",
  files: typeof __FILES__ === "undefined" ? null : __FILES__,
  version: typeof __VERSION__ === "undefined" ? null : __VERSION__,
  ops: { sync, deleteAccount, deleteLocalData },
});
