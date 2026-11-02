// Adds to every POST response what the page expects alongside the handler's
// HTML: the toasts, the login link after a 401, and the sync count. Used by
// the service worker (sw.ts) and by the page running the same routes itself
// (js/routes.bundle.ts), so both answer a form the same way.
import type { SwResponse } from "@jon49/sw/web-framework.js";

const {
  globalDb,
  html,
  views: { loginView, syncCountView },
} = self.sw;

// The framework toasts this after every successful POST.
const savedMessage = "Saved!";

// Pages the coach uses during a game (rendered by match/_play.ts). Their
// toasts show failures only: a "Saved!" on every tap would get in the way.
function isFromGamePlay(req: Request) {
  if (!req.referrer || req.referrer === "about:client") return false;
  let referrer = new URL(req.referrer);
  let handler = referrer.searchParams.get("handler");
  return (
    /\/web\/match\/?$/.test(referrer.pathname) &&
    (handler === "play" || handler === "activityPlayerSelector")
  );
}

export async function useHtmz(req: Request, res: SwResponse, ctx: any): Promise<void> {
  if (req.method !== "POST") return;

  let updated = await globalDb.updated();

  let messages = (ctx.messages || []) as string[];
  if (isFromGamePlay(req)) {
    messages = messages.filter((x) => x !== savedMessage);
  }

  if (res.error) {
    messages.push(res.error);
  }

  (res as any).body = html`${(res as any).body}
<div id=toasts>
    ${messages.map((x) => html`<dialog class=toast _load=toast open><p class=message>${x}</p></dialog>`)}
</div>
${res.status === 401 ? html`${loginView()}` : null}
${syncCountView(updated.length)}
`;
}
