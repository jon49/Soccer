// Auto-sync runs silently in the background.
//
// - Initial sync once per browser session (sessionStorage flag).
// - Debounced sync after any state-mutating htmz response.
// - Opt-out: when `disableAutoSyncDuringGame` is set and the URL is /web/match,
//   skip auto-sync so the in-progress game UI stays responsive.
//
// Errors are swallowed: no toaster, no banner. The sync count badge still
// updates because the SW post middleware appends syncCountView; we morph
// only that node so existing toasts and DOM state are left alone. The page
// reloads only when the server returns the refresh marker (i.e. it actually
// delivered new data).

const SYNC_URL = "/web/api/sync?handler=auto";
const SESSION_KEY = "auto-sync:init";
const DEBOUNCE_MS = 1500;

let inflight: Promise<void> | null = null;
let pending = false;
let debounceTimer: number | null = null;

function isDuringGame(): boolean {
  return location.pathname.startsWith("/web/match");
}

function isDisabledDuringGames(): boolean {
  let meta = document.querySelector('meta[name="auto-sync-disable-during-game"]');
  return meta?.getAttribute("content") === "1";
}

function shouldSkip(): boolean {
  return isDuringGame() && isDisabledDuringGames();
}

async function runSync() {
  if (shouldSkip()) return;
  let res;
  try {
    res = await fetch(SYNC_URL, {
      method: "POST",
      headers: { "HF-Request": "true" },
      credentials: "same-origin",
    });
  } catch {
    return;
  }
  if (!res.ok && res.status !== 204) return;
  let body: string;
  try {
    body = await res.text();
  } catch {
    return;
  }
  if (!body) return;

  let doc = new DOMParser().parseFromString(body, "text/html");

  if (doc.querySelector('[_load="refresh"]')) {
    location.reload();
    return;
  }

  let newCount = doc.querySelector("#syncCount");
  let oldCount = document.getElementById("syncCount");
  if (newCount && oldCount) {
    oldCount.replaceWith(newCount);
  }
}

async function trigger() {
  if (inflight) {
    pending = true;
    return;
  }
  inflight = (async () => {
    try {
      await runSync();
    } finally {
      let again = pending;
      pending = false;
      inflight = null;
      if (again) trigger();
    }
  })();
}

function scheduleDebounced() {
  if (debounceTimer != null) clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    trigger();
  }, DEBOUNCE_MS);
}

// Initial sync once per browser session. If we're skipping (e.g. the user
// landed on a match page with auto-sync-during-games disabled) leave the
// flag unset so the initial sync can fire after they navigate away.
function initialSync() {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    if (shouldSkip()) return;
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // sessionStorage unavailable — still attempt once.
  }
  trigger();
}

// hz:completed fires after every htmz iframe morph (i.e. every POST mutation
// the user made). Debounce so a burst of edits coalesces into one sync.
document.addEventListener("hz:completed", scheduleDebounced);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialSync);
} else {
  initialSync();
}
