// Syncing, which the service worker does (sw.ts):
//
// - The sync button in the header syncs now and says how it went.
// - Auto-sync (@jon49/web/app/auto-sync.js) syncs once per browser session,
//   and again a moment after each change (a burst of edits makes one sync). It
//   says nothing. Not during a match with Settings' "don't sync during games"
//   set.
//
// When a sync brings new data, the page is drawn again. The sync count in
// the header follows every change.
import * as globalDb from "../data/global-model.js";
import { startAutoSync as autoSync } from "@jon49/web/app/auto-sync.js";
import { replace } from "@jon49/web/app/dom.js";
import { refresh } from "@jon49/web/app/router.js";
import { loginView, syncCountView } from "./layout.js";
import { call } from "./worker.js";

export async function updateSyncCount() {
  await replace(syncCountView((await globalDb.updated()).length));
}

async function sync() {
  let result = await call("sync");
  await updateSyncCount();
  return result;
}

// A sync, then the page drawn again if it brought new data. Not for an
// action: refresh() runs after the action that asks for it.
async function syncAndDraw() {
  let result = await sync();
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
  // Drawn after this action.
  if (result.status === 200) refresh();
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

// For the e2e tests (e2e/fixtures.ts): a sync, as the button does, with the
// worker's result, once the page is drawn again.
(window as any).appSync = syncAndDraw;

export function startAutoSync() {
  autoSync({
    sync: syncAndDraw,
    // During a match, with Settings' "Disable auto-sync during games".
    async skip() {
      if (!location.pathname.startsWith("/web/match")) return false;
      return !!(await globalDb.settings()).disableAutoSyncDuringGame;
    },
    changed: updateSyncCount,
  });
}
