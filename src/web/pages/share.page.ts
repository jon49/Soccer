import type { ApiResult, Invite, SpaceMember } from "../data/share-api.js";
import type { Actions, Page } from "../app/page.js";
import { replace } from "../app/dom.js";
import { loginView } from "../app/layout.js";
import { navigate } from "../app/router.js";
import { call } from "../app/worker.js";
import * as globalDb from "../data/global-model.js";
import html from "html-template-tag-stream";
import {
  inviteUrl,
  spaceCreate,
  spaceInviteCreate,
  spaceMemberRemove,
  spaceMembers,
} from "../data/share-api.js";
import { isSharedTeamId, teamGet } from "../data/repo-team.js";
import { publishTeamSchedule } from "../data/repo-schedule.js";
import { spacesForget, teamMoveLocal } from "../data/repo-share.js";
import { reject, when } from "../data/utils.js";
import { queryTeamIdValidator } from "../data/validators.js";
import { validateObject } from "promise-validation";
import { teamNav } from "./_shared-views.js";

const sharedTeamIdValidator = {
  teamId: async (val: string) => {
    let { teamId } = await validateObject({ teamId: val }, queryTeamIdValidator);
    return isSharedTeamId(teamId) ? teamId : reject("This team isn't shared.");
  },
};

const memberValidator = {
  user: async (val: string | undefined) =>
    val && /^[\w-]+$/.test(val) ? val : reject("Unknown coach."),
};

// The invite link's Copy button.
async function copy(button: HTMLElement) {
  try {
    await navigator.clipboard.writeText(button.dataset.url ?? "");
    button.textContent = "Copied!";
  } catch {
    (document.getElementById("invite-link") as HTMLInputElement | null)?.select();
  }
}

function inviteView(invite?: Invite) {
  let url = invite && inviteUrl(invite.code);
  return html`
<div id=invite>
  <form _submit=invite>
    <button>${invite ? "Create another invite link" : "Invite another coach"}</button>
  </form>
  ${when(
    url,
    (url: string) => html`
  <p>Send this link to the coach you want to add. It works for one person and expires in 7 days.</p>
  <input id=invite-link type=text readonly value="${url}">
  <button type=button _click=copyInvite data-url="${url}">Copy</button>
  <button type=button _click=shareInvite data-url="${url}">Share</button>`,
  )}
</div>`;
}

function membersView(result: ApiResult<{ members: SpaceMember[] }>) {
  if (!result.ok) {
    return html`
<div id=members>
  <p>Could not load who this team is shared with. ${result.message}</p>
</div>`;
  }
  let { members } = result.json;
  let last = members.length <= 1;
  return html`
<div id=members>
  <ul class=list>
    ${members.map(
      (x) => html`
    <li>
      <span>${x.email}${when(x.me, " (you)")}</span>
      ${
        x.me
          ? html`
      <form _submit=leave>
        <button
          _click=confirm
          data-confirm="${
            last
              ? "You're the only coach on this team. Leaving deletes the team and all its games for good. Leave anyway?"
              : "Leave this team? It will be removed from this device."
          }">Leave team</button>
      </form>`
          : html`
      <form _submit=removeCoach>
        <input type=hidden name=user value="${x.user}">
        <button
          _click=confirm
          data-confirm="Remove ${x.email} from this team? They lose access the next time they sync.">Remove</button>
      </form>`
      }
    </li>`,
    )}
  </ul>
</div>`;
}

async function render(query: any) {
  let { teamId } = await validateObject(query, queryTeamIdValidator);
  let team = await teamGet(teamId);
  let heading = html`<h2>Share ${team.name} (${team.year})</h2>`;

  if (!isSharedTeamId(team.id)) {
    return {
      team,
      main: html`
${heading}
<p>
  Sharing gives another coach full access to this team: players, games,
  matches, and stats. Every coach on a shared team can edit it, invite
  others, and remove anyone. Only one coach should run a given match.
</p>
<p>You need to be online and logged in to share.</p>
<form _submit=share>
  <button>Share this team</button>
</form>`,
    };
  }

  let invite: Invite | undefined =
    typeof query.invite === "string" ? { code: query.invite, expires: +query.expires } : undefined;
  return {
    team,
    main: html`
${heading}
${when(
  query.scheduleError,
  html`
    <p>
      <strong>The published schedule could not be moved to the shared team.</strong>
      Other coaches can't republish it until you republish it from the Games page.
    </p>
  `,
)}
${inviteView(invite)}
<h3>Coaches on this team</h3>
${membersView(await spaceMembers(team.id))}`,
  };
}

async function syncQuietly() {
  try {
    return (await call("sync")).status;
  } catch (err) {
    console.error("sync after sharing change failed", err);
    return 0;
  }
}

const actions: Actions = {
  copyInvite: ({ el }) => copy(el),

  async shareInvite({ el }) {
    if (!navigator.share) return copy(el);
    await navigator.share({ title: "Join my team", url: el.dataset.url }).catch(() => {});
  },

  async share({ query }) {
    let { teamId } = await validateObject(query, queryTeamIdValidator);
    if (isSharedTeamId(teamId)) return reject("This team is already shared.");
    if (!(await globalDb.isLoggedIn())) {
      await replace(loginView());
      return "Log in to share a team.";
    }
    let team = await teamGet(teamId);

    let created = await spaceCreate();
    if (!created.ok) return reject(`Could not share the team. ${created.message}`);
    let space = created.json.space;

    await teamMoveLocal(teamId, space, () => true);
    await syncQuietly();

    let url = `/web/share?teamId=${space}`;
    if (team.scheduleFileId) {
      // Republishing tags the page with the space so every coach can update
      // it. The parents' link doesn't change.
      try {
        await publishTeamSchedule(await teamGet(space));
      } catch (err) {
        console.error("schedule republish after sharing failed", err);
        url += "&scheduleError=1";
      }
    }

    let invite = await spaceInviteCreate(space);
    if (invite.ok) {
      url += `&invite=${encodeURIComponent(invite.json.code)}&expires=${invite.json.expires}`;
    }

    await navigate(url, { replace: true });
  },

  async invite({ query }) {
    let { teamId } = await validateObject(query, sharedTeamIdValidator);
    let invite = await spaceInviteCreate(teamId);
    if (!invite.ok) return reject(`Could not create an invite link. ${invite.message}`);
    await replace(inviteView(invite.json));
  },

  async removeCoach({ query, data }) {
    let [{ teamId }, { user }] = await Promise.all([
      validateObject(query, sharedTeamIdValidator),
      validateObject(data, memberValidator),
    ]);
    let removed = await spaceMemberRemove(teamId, user);
    if (!removed.ok && removed.status !== 404) {
      return reject(`Could not remove the coach. ${removed.message}`);
    }
    await replace(membersView(await spaceMembers(teamId)));
    return "Coach removed.";
  },

  async leave({ query }) {
    let { teamId } = await validateObject(query, sharedTeamIdValidator);
    let left = await spaceMemberRemove(teamId, "me");
    // 404: we were already removed, or the team is gone. Either way, forget it.
    if (!left.ok && left.status !== 404) {
      return reject(`Could not leave the team. ${left.message}`);
    }
    await spacesForget([teamId]);
    await navigate("/web/teams", { replace: true });
  },
};

export default {
  async render({ query }) {
    let { team, main } = await render(query);
    return { main, nav: teamNav(team.id), title: `Share - ${team.name} (${team.year})` };
  },
  actions,
} satisfies Page;
