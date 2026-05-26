import type { RoutePostHandler, RoutePage } from "@jon49/sw/routes.middleware.js";
import sync from "../server/sync.js";

const { html } = self.sw;

let refresh = html`
  <i _load="refresh" id="temp"></i>
`;

const postHandlers: RoutePostHandler = {
  async post() {
    let result = await sync();
    switch (result.status) {
      case 200:
        return {
          status: 200,
          body: refresh,
        };
      default:
        return { status: 204, message: "" };
    }
  },
  async auto() {
    // Silent variant of `post`: no toaster, no error banner, no login redirect.
    // The sw.ts middleware appends syncCountView so the badge still updates.
    // The client checks the response body for the refresh marker to decide
    // whether to reload (only when the server delivered new data).
    let result;
    try {
      result = await sync();
    } catch {
      return { status: 204, message: "" };
    }
    if (result.status === 200) {
      return { status: 200, body: refresh, message: "" };
    }
    return { status: 204, message: "" };
  },
  async force() {
    let result = await sync();
    switch (result.status) {
      case 200:
        return {
          message: "Synced!",
          status: 200,
          body: refresh,
        };
      case 204:
        return {
          message: "Synced!",
          response: null,
          body: refresh,
        };
      case 401:
      case 403:
        return {
          status: 401,
          message: "You are not logged in!",
        };
      case 503:
        return {
          status: 503,
          message: "Hold your horses! You are syncing too fast!",
        };
      default:
        return {
          status: 500,
          message: "Unknown error!",
        };
    }
  },
};

const router: RoutePage = {
  post: postHandlers,
};

export default router;
