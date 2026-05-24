import { Settings, Theme, get, set, update } from "./db.js";

function parseKey(key: unknown): string | number {
  return typeof key === "string" && key.startsWith("[")
    ? JSON.parse(key)
    : (key as string | number);
}

const settingDefaults: Settings = {
  lastSyncedId: 0,
  lastSynced: 0,
  theme: null,
  defaultTheme: null,
};

export interface AuthTokens {
  auth_token: string;
  refresh_token: string;
  csrf_token?: string;
}

export async function updated(): Promise<(string | number)[]> {
  return Array.from((await get("updated")) ?? new Set()).map(parseKey);
}

export async function setLoggedIn(loggedIn: boolean): Promise<void> {
  await set("loggedIn", loggedIn, false);
  if (!loggedIn) {
    await clearAuthTokens();
  }
}

export async function isLoggedIn(): Promise<boolean> {
  if (await get("loggedIn")) return true;
  return !!(await get("auth_token"));
}

export async function authTokens(): Promise<AuthTokens | undefined> {
  let auth_token = await get<string>("auth_token");
  if (!auth_token) return;
  let refresh_token = (await get<string>("refresh_token")) ?? "";
  let csrf_token = await get<string>("csrf_token");
  return { auth_token, refresh_token, csrf_token };
}

export async function setAuthTokens(tokens: AuthTokens): Promise<void> {
  await Promise.all([
    set("auth_token", tokens.auth_token, false),
    set("refresh_token", tokens.refresh_token, false),
    tokens.csrf_token != null ? set("csrf_token", tokens.csrf_token, false) : Promise.resolve(),
    set("loggedIn", true, false),
  ]);
}

export async function clearAuthTokens(): Promise<void> {
  await Promise.all([
    set("auth_token", null, false),
    set("refresh_token", null, false),
    set("csrf_token", null, false),
  ]);
}

export async function settings(): Promise<Settings> {
  return { ...settingDefaults, ...((await get("settings")) ?? {}) };
}

export async function setTheme(theme: Theme, defaultTheme: Theme): Promise<void> {
  await update("settings", (v) => ({ ...(v ?? settingDefaults), theme, defaultTheme }), {
    sync: false,
  });
}

export function setSettings(settings: Settings) {
  return set("settings", settings, false);
}
