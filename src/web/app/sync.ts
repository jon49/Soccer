// Syncing, which the service worker does (sw.ts):
//
// - The sync button in the header syncs now and says how it went.
// - Auto-sync syncs once per browser session, and again a moment after each
//   change (a burst of edits makes one sync). It says nothing. Not during a
//   match with Settings' "don't sync during games" set.
//
// When a sync brings new data, the page is drawn again. The sync count in
// the header follows every change.
import * as globalDb from "../data/global-model.js";
import { replace } from "./dom.js";
import { loginView, syncCountView } from "./layout.js";
import { refresh } from "./router.js";
import { call } from "./worker.js";

const SESSION_KEY = "auto-sync:init";
const DEBOUNCE_MS = 1500;

export async function updateSyncCount() {
  await replace(syncCountView((await globalDb.updated()).length));
}

async function sync() {
  let result = await call("sync");
  await updateSyncCount();
  if (result.status === 200) await refresh();
  return result;
}

// The sync button.
export async function syncNow() {
  let result;
  try {
    result = await sync();
  } catch (e) {
    console.error("sync failed", e);
    return "Unknown error!";
  }
  switch (result.status) {
    case 200:
      return [...result.messages, "Synced!"].filter(Boolean);
    case 204:
      return [...result.messages, "Synced!"].filter(Boolean);
    case 401:
    case 403:
      await replace(loginView());
      return "You are not logged in!";
    case 503:
      return "Hold your horses! You are syncing too fast!";
    default:
      return "Unknown error!";
  }
}

/*** Auto-sync ***/

let inflight: Promise<void> | null = null;
let pending = false;
let timer: number | undefined;

async function skip() {
  // The e2e tests sync when they choose (e2e/fixtures.ts).
  if ((window as any).e2eAutoSyncOff) return true;
  if (!location.pathname.startsWith("/web/match")) return false;
  return !!(await globalDb.settings()).disableAutoSyncDuringGame;
}

async function autoSync() {
  if (await skip()) return;
  try {
    await sync();
  } catch (e) {
    console.warn("auto sync failed", e);
  }
}

function trigger() {
  if (inflight) {
    pending = true;
    return;
  }
  inflight = autoSync().finally(() => {
    inflight = null;
    if (pending) {
      pending = false;
      trigger();
    }
  });
}

// For the e2e tests (e2e/fixtures.ts): a sync, as the button does, with the
// worker's result.
(window as any).appSync = sync;

export function startAutoSync() {
  // Something to sync: a record with a _rev was saved (data/db.ts).
  document.addEventListener("db:changed", () => {
    updateSyncCount();
    clearTimeout(timer);
    timer = window.setTimeout(trigger, DEBOUNCE_MS);
  });

  // Once per browser session. If it's skipped now (a match), it can run
  // after the coach moves on.
  (async () => {
    try {
      if (sessionStorage.getItem(SESSION_KEY) || (await skip())) return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {}
    trigger();
  })();
}
