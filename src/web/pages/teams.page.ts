import type { Game, Team } from "../server/db.js";
import type { RoutePage, RoutePostHandler } from "@jon49/sw/routes.middleware.js";

const {
  globalDb,
  html,
  layout,
  repo: { isSharedTeamId, teamGetAll, teamsCreate },
  utils: { formatGameDate, formatGameTime, todayDateString, when },
  validation: { dataTeamNameYearValidator, validateObject },
  views: { helpView, nextSetupStepFor },
} = self.sw;

const render = async () => {
  let [{ teams, total }, loggedIn] = await Promise.all([
    teamGetAll("active"),
    globalDb.isLoggedIn(),
  ]);
  let wasFiltered = total > teams.length;

  return html`
<h2>Teams</h2>

${when(total, () =>
  helpView(html`
    <p>Each team keeps its own players, formation, games and stats. Tap a
    team's name to open it; its pages are in the tabs along the top: Players,
    Games, Stats and Formation.</p>
    <p>A team that isn't finished setting up shows its next step. Tap
    <strong>Games</strong> on a card to go straight to its schedule.</p>
    <p>Teams set to Inactive (on the team's Players page) are hidden here
    until you tap <em>Show all teams</em>.</p>
    ${loggedIn ? null : loginTip()}`),
)}

<ul id=teams class=team-list>
    ${teams.map((x) => getTeamView(x))}
</ul>

${when(!teams.length, () =>
  total
    ? html`
        <p id="noTeams">No active teams.</p>
      `
    : welcomeView(loggedIn),
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

// The first visit: what the app is for and the steps to a first match. It
// goes once a team is added (the post sends an empty #noTeams).
function welcomeView(loggedIn: boolean) {
  return html`
<section id=noTeams class=welcome>
    <p><strong>Welcome!</strong> This app helps you run your games from the
    sideline: who's on the field, where they're playing, how long they've
    been on and the score, so every player gets their share of time.</p>
    <p>Getting set up takes a few minutes:</p>
    <ol>
        <li><strong>Make a team</strong>, just below.</li>
        <li><strong>Add players</strong> to its roster.</li>
        <li><strong>Set up a formation</strong>: the positions on the field.</li>
        <li><strong>Add a game</strong> to the schedule.</li>
        <li>On game day, <strong>open the game and run the match</strong>.</li>
    </ol>
    <p>The app walks you through each step. Everything is saved on this
    device and works without a connection.</p>
    ${loggedIn ? null : loginTip()}
</section>`;
}

function loginTip() {
  return html`
    <p>
      <a href="/login" target="_self">Log in</a> to back your teams up, use them on your other devices,
      or share a team with another coach. Got an invite link from a coach? Open it to join their team.
    </p>
  `;
}

// A team's soonest game today or later.
function nextGame(team: Team): Game | undefined {
  let today = todayDateString();
  return [...team.games]
    .filter((x) => x.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""))[0];
}

async function getTeamView(team: Team, includeSwap = false) {
  let teamId = team.id;
  let next = nextGame(team);
  let step = await nextSetupStepFor(team);
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
        ${when(
          step,
          (step) =>
            html`<p class=team-setup>Next step: <a href="${step.url}" target="_self">${step.title}</a></p>`,
        )}
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
