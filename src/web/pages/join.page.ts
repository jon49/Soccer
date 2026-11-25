import type { Actions, Page } from "../app/page.js";
import { replace } from "../app/dom.js";
import { loginView as headerLoginView } from "../app/layout.js";
import { call } from "../app/worker.js";
import * as globalDb from "../data/global-model.js";
import html from "html-template-tag-stream";
import { get } from "../data/db.js";
import { inviteAccept, invitePreview } from "../data/share-api.js";
import { reject } from "../data/utils.js";
import { validateObject } from "promise-validation";

const EXPIRED = "This invite has expired or was already used. Ask for a new one.";

const codeValidator = {
  code: async (val: string | undefined) =>
    val && /^[0-9a-f-]{36}$/i.test(val) ? val : reject("This invite link is missing its code."),
};

function joinView(body: any) {
  return html`<div id=join>${body}</div>`;
}

// A fresh template each time: a template can only be read once.
const teamsLink = () => html`
  <p><a href="/web/teams">Go to your teams</a></p>
`;

function loginView(code: string) {
  let back = encodeURIComponent(`/web/join/?code=${code}`);
  return joinView(html`
<p>Log in to join this team.</p>
<p><a href="/login/?return=${back}" role=button class=nc-button>Log in</a></p>`);
}

async function render(query: any) {
  let code: string;
  try {
    ({ code } = await validateObject(query, codeValidator));
  } catch {
    return joinView(html`<p>This invite link is missing its code.</p>${teamsLink()}`);
  }

  if (!(await globalDb.isLoggedIn())) return loginView(code);

  let preview = await invitePreview(code);
  if (!preview.ok) {
    if (preview.status === 401) return loginView(code);
    return joinView(
      html`<p>${preview.status === 404 ? EXPIRED : preview.message}</p>${teamsLink()}`,
    );
  }

  if (preview.json.member) {
    return joinView(html`<p>You're already on this team.</p>${teamsLink()}`);
  }

  return joinView(html`
<p>Join the team shared by <strong>${preview.json.invitedBy}</strong>?</p>
<p>You'll both be able to edit everything on it.</p>
<form _submit=accept>
  <button>Join</button>
  <a href="/web/teams" role=button class=nc-button>Cancel</a>
</form>`);
}

const actions: Actions = {
  async accept({ query }) {
    let { code } = await validateObject(query, codeValidator);
    let accepted = await inviteAccept(code);
    if (!accepted.ok) {
      if (accepted.status === 401) {
        await replace(headerLoginView());
        return "Log in to join this team.";
      }
      return reject(accepted.status === 404 ? EXPIRED : accepted.message);
    }

    // The new space shows up in this sync's membership list, and with no
    // cursor yet it pulls the team's whole history.
    try {
      await call("sync");
    } catch (err) {
      console.error("sync after joining failed", err);
    }
    let team = await get<{ name?: string; year?: string }>(["team", accepted.json.space]);
    let message = team?.name
      ? `You joined ${team.name} (${team.year}).`
      : "You joined the team. It will show up after the next sync.";

    await replace(joinView(html`<p>${message}</p>${teamsLink()}`));
    return message;
  },
};

export default {
  async render({ query }) {
    return { main: html`<h2>Join a team</h2>${await render(query)}`, title: "Join a team" };
  },
  actions,
} satisfies Page;
