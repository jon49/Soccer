import type { Game, Team } from "../server/db.js";
import type { RoutePage, RoutePostHandler } from "@jon49/sw/routes.middleware.js";

const {
  html,
  layout,
  repo: { isSharedTeamId, teamGetAll, teamsCreate },
  utils: { formatGameDate, formatGameTime, todayDateString, when },
  validation: { dataTeamNameYearValidator, validateObject },
} = self.sw;

const render = async () => {
  let { teams, total } = await teamGetAll("active");
  let wasFiltered = total > teams.length;

  return html`
<h2>Teams</h2>

<ul id=teams class=team-list>
    ${teams.map((x) => getTeamView(x))}
</ul>

${when(
  !teams.length,
  () => html`<p id=noTeams>${total ? "No active teams." : "No teams yet. Add one below."}</p>`,
)}

${
  wasFiltered
    ? html`
        <p><a id="allTeams" href="?handler=all">Show all teams.</a></p>
      `
    : null
}

<h3>Add a team</h3>

<form class=form action="/web/teams" method=post  _submit=reset>
  <div>
    <label for=name>Team Name</label>
    <input
        id=name
        name=name
        type=text
        $${when(!teams.length, "autofocus")}
        _change=clearAutoFocus
        required>
  </div>
  <div>
    <label for=year>Year</label>
    <input id=year name=year type=text required value="${new Date().getFullYear()}">
  </div>
  <button>Save</button>
</form>`;
};

// A team's soonest game today or later.
function nextGame(team: Team): Game | undefined {
  let today = todayDateString();
  return [...team.games]
    .filter((x) => x.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""))[0];
}

function getTeamView(team: Team, includeSwap = false) {
  let teamId = team.id;
  let next = nextGame(team);
  return html`
    <li class=team-card $${when(includeSwap, `hz-target="#teams" hz-swap="append"`)}>
        <a class=team-name target="_self" href="/web/players?teamId=${teamId}">${team.name} - ${team.year}${when(
          isSharedTeamId(teamId),
          html`
            <span class="badge">Shared</span>
          `,
        )}</a>
        ${
          next
            ? html`<p class=team-next>Next:
                <a href="/web/match?teamId=${teamId}&gameId=${next.id}" target="_self">${formatGameDate(next.date)}${when(next.time, (time) => ` · ${formatGameTime(time)}`)} vs ${next.opponent}</a></p>`
            : html`
                <p class="team-next team-next-none">No upcoming games</p>
              `
        }
        <a class=team-games target="_self" href="/web/games?teamId=${teamId}">Games</a>
    </li>`;
}

const postHandlers: RoutePostHandler = {
  post: async function post({ data }) {
    let d = await validateObject(data, dataTeamNameYearValidator);
    let team = await teamsCreate(d);
    return html`${getTeamView(team, true)}<template id=noTeams></template>`;
  },
};

const route: RoutePage = {
  get: {
    async get() {
      return layout({
        main: await render(),
        title: "Teams",
      });
    },
    async all() {
      let { teams } = await teamGetAll("inactive");
      return html`
<template id="teams" hz-swap="append">
    ${teams.map((x) => getTeamView(x))}
</template>
<template id="allTeams"></template>
<template id="noTeams"></template>`;
    },
  },

  post: postHandlers,
};

export default route;
