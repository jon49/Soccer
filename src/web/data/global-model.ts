import { Settings, Theme, get, set, update } from "./db.js";

// The login tokens (shared with ../weight).
export {
  authTokens,
  clearAuthTokens,
  isLoggedIn,
  setAuthTokens,
  setLoggedIn,
  type AuthTokens,
} from "@jon49/sw/auth.js";

function parseKey(key: unknown): string | number {
  return typeof key === "string" && key.startsWith("[")
    ? JSON.parse(key)
    : (key as string | number);
}

const settingDefaults: Settings = {
  lastSyncedId: 0,
  lastSynced: 0,
  theme: null,
};

export async function updated(): Promise<(string | number)[]> {
  return Array.from((await get("updated")) ?? new Set()).map(parseKey);
}

export async function settings(): Promise<Settings> {
  return { ...settingDefaults, ...((await get("settings")) ?? {}) };
}

export async function setTheme(theme: Theme): Promise<void> {
  // A copy the app shell (web/index.html) reads before the first draw.
  try {
    if (theme) localStorage.setItem("theme", theme);
    else localStorage.removeItem("theme");
  } catch {}
  await update("settings", (v) => ({ ...(v ?? settingDefaults), theme }), {
    sync: false,
  });
}

export function setSettings(settings: Settings) {
  return set("settings", settings, false);
}
