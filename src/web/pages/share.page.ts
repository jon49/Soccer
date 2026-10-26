import type { RoutePage, RoutePostHandler } from "@jon49/sw/routes.middleware.js";
import type { Team } from "../server/db.js";
import type { ApiResult, Invite, SpaceMember } from "../server/repo-share.js";
import sync from "../server/sync.js";
import { errorToPlain, logSyncError } from "../server/sync-log.js";

const {
  globalDb,
  html,
  layout,
  repo: {
    inviteUrl,
    isSharedTeamId,
    publishTeamSchedule,
    spaceCreate,
    spaceInviteCreate,
    spaceMemberRemove,
    spaceMembers,
    spacesForget,
    teamGet,
    teamMoveLocal,
  },
  utils: { reject, when },
  validation: { queryTeamIdValidator, validateObject },
  views: { teamNav },
} = self.sw;

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

// Registers the Copy / Share buttons' actions. Runs once with the page;
// morphed-in invite links reuse it.
const inviteScript = `(() => {
  async function copy(button) {
    try {
      await navigator.clipboard.writeText(button.dataset.url);
      button.textContent = "Copied!";
    } catch {
      document.getElementById("invite-link")?.select();
    }
  }
  Object.assign(window.app, {
    copyInvite: ({ target }) => copy(target.closest("[data-url]")),
    shareInvite: ({ target }) => {
      let button = target.closest("[data-url]");
      if (!navigator.share) return copy(button);
      navigator.share({ title: "Join my team", url: button.dataset.url }).catch(() => {});
    },
  });
})();`;

function inviteView(team: Team, invite?: Invite) {
  let url = invite && inviteUrl(invite.code);
  return html`
<div id=invite>
  <form method=post action="?handler=invite&teamId=${team.id}">
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

function membersView(team: Team, result: ApiResult<{ members: SpaceMember[] }>) {
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
      <form method=post action="?handler=leave&teamId=${team.id}">
        <button
          _click=confirm
          data-confirm="${
            last
              ? "You're the only coach on this team. Leaving deletes the team and all its games for good. Leave anyway?"
              : "Leave this team? It will be removed from this device."
          }">Leave team</button>
      </form>`
          : html`
      <form method=post action="?handler=remove&teamId=${team.id}">
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
<form method=post action="?handler=share&teamId=${team.id}">
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
${inviteView(team, invite)}
<h3>Coaches on this team</h3>
${membersView(team, await spaceMembers(team.id))}
<script>$${inviteScript}</script>`,
  };
}

async function syncQuietly() {
  try {
    return (await sync()).status;
  } catch (err) {
    await logSyncError("sync after sharing change failed", errorToPlain(err));
    return 0;
  }
}

const postHandlers: RoutePostHandler = {
  async share({ query }) {
    let { teamId } = await validateObject(query, queryTeamIdValidator);
    if (isSharedTeamId(teamId)) return reject("This team is already shared.");
    if (!(await globalDb.isLoggedIn())) {
      return { status: 401, message: "Log in to share a team." };
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
        await logSyncError("schedule republish after sharing failed", errorToPlain(err));
        url += "&scheduleError=1";
      }
    }

    let invite = await spaceInviteCreate(space);
    if (invite.ok) {
      url += `&invite=${encodeURIComponent(invite.json.code)}&expires=${invite.json.expires}`;
    }

    return {
      body: html`<i _load=redirect id=temp data-url="${url}"></i>`,
      message: "",
    };
  },

  async invite({ query }) {
    let { teamId } = await validateObject(query, sharedTeamIdValidator);
    let team = await teamGet(teamId);
    let invite = await spaceInviteCreate(teamId);
    if (!invite.ok) return reject(`Could not create an invite link. ${invite.message}`);
    return { body: inviteView(team, invite.json), message: "" };
  },

  async remove({ query, data }) {
    let [{ teamId }, { user }] = await Promise.all([
      validateObject(query, sharedTeamIdValidator),
      validateObject(data, memberValidator),
    ]);
    let team = await teamGet(teamId);
    let removed = await spaceMemberRemove(teamId, user);
    if (!removed.ok && removed.status !== 404) {
      return reject(`Could not remove the coach. ${removed.message}`);
    }
    return { body: membersView(team, await spaceMembers(teamId)), message: "Coach removed." };
  },

  async leave({ query }) {
    let { teamId } = await validateObject(query, sharedTeamIdValidator);
    let left = await spaceMemberRemove(teamId, "me");
    // 404: we were already removed, or the team is gone. Either way, forget it.
    if (!left.ok && left.status !== 404) {
      return reject(`Could not leave the team. ${left.message}`);
    }
    await spacesForget([teamId]);
    return {
      body: html`
        <i _load="redirect" id="temp" data-url="/web/teams"></i>
      `,
      message: "",
    };
  },
};

const route: RoutePage = {
  async get({ query }) {
    let { team, main } = await render(query);
    return layout({
      main,
      nav: teamNav(team.id),
      title: `Share - ${team.name} (${team.year})`,
    });
  },
  post: postHandlers,
};

export default route;
