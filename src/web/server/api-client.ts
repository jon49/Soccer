const { globalDb } = self.sw;

const REFRESH_URL = "/api/auth/v1/refresh";

// Authenticated fetch against `/api/*` with the same 401-then-refresh-once
// dance used by sync: attach the stored auth token, and if the server says
// it's stale, refresh it and retry exactly once before giving up.
export async function authFetch(url: string, init: RequestInit): Promise<Response> {
  let tokens = await globalDb.authTokens();
  if (!tokens) {
    await globalDb.setLoggedIn(false);
    return new Response(null, { status: 401 });
  }

  let res = await fetchWithToken(url, init, tokens.auth_token);

  if (res.status === 401 && tokens.refresh_token) {
    let refreshed = await refreshAuthToken(tokens.refresh_token);
    if (refreshed) {
      await globalDb.setAuthTokens({ ...tokens, auth_token: refreshed });
      res = await fetchWithToken(url, init, refreshed);
    }
  }

  if (res.status === 401) {
    await globalDb.setLoggedIn(false);
  }

  return res;
}

// Status 0 is not a real HTTP status — it's this module's sentinel for "the
// request never reached the network" (offline, DNS failure, server
// unreachable), as opposed to a real error response from the server.
export const OFFLINE_STATUS = 0;

function fetchWithToken(url: string, init: RequestInit, authToken: string) {
  return fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${authToken}` },
    credentials: "same-origin",
    mode: "same-origin",
  }).catch(() => new Response(null, { status: OFFLINE_STATUS }));
}

async function refreshAuthToken(refreshToken: string): Promise<string | null> {
  try {
    let res = await fetch(REFRESH_URL, {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      mode: "same-origin",
    });
    if (!res.ok) return null;
    let json = await res.json();
    return typeof json?.auth_token === "string" ? json.auth_token : null;
  } catch {
    return null;
  }
}
