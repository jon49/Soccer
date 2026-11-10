import type { Team, TeamId, TeamPlayer, TeamPlayerStatus } from "../server/db.js";
import type { RoutePostHandler, RoutePage, RouteGetHandler } from "@jon49/sw/routes.middleware.js";

const {
  html,
  layout,
  repo: { isSharedTeamId, teamGet, playerCreate, teamSave },
  utils: { equals, when },
  validation: {
    assert,
    validate,
    validateObject,
    createString25,
    dataPlayerNameStatusValidator,
    dataTeamNameYearActiveValidator,
    queryTeamIdPlayerIdValidator,
    queryTeamIdValidator,
  },
  views: { teamNav },
} = self.sw;

interface PlayersEditView {
  team: Team;
}

async function start(query: any): Promise<PlayersEditView> {
  let { teamId } = await validateObject(query, queryTeamIdValidator);

  let team = await teamGet(teamId);

  return { team };
}

function render(o: PlayersEditView) {
  let { team } = o;

  return html`
<h2 id=subheading>${o?.team.name ?? "Unknown"} (${o?.team.year})</h2>

<nav>
    <ul>
        <li><a href="#team" target="_self">Team</a></li>
        <li><a href="#players" target="_self">Players</a></li>
        <li><a href="/web/share?teamId=${team.id}" target="_self">${
          isSharedTeamId(team.id) ? "Sharing" : "Share"
        }</a></li>
    </ul>
</nav>

<h3 id=team>Team Settings</h3>
<form
    _change=submit
    class=form
    method=post
    action="?handler=editTeam&teamId=${team.id}"
    >
    <div class=inline>
        <label for=team-input>Team Name:</label><input id=team-input name=name type=text value="${team.name}">
    </div>
    <div class=inline>
        <label for=year-input>Year:</label> <input id=year-input name=year type=text value="${team.year}">
    </div>
    <div id=team-active>
        <label class=toggle>
            <input name=active type=checkbox $${when(team.active, "checked")}>
            <span class="off nc-button" role="button">Inactive</span>
            <span class="on nc-button" role="button">Active</span>
        </label>
    </div>
</form>

${playersHeading(team)}
${when(
  !team.players.length,
  () =>
    html`
      <p id="noPlayers">No players have been added.</p>
    `,
)}

<ul id=playerCards class=player-list>
    ${team.players.map((x) => playerView(x, team.id))}
</ul>

<form
    class="form add-player"
    method=post
    action="?handler=addPlayer&teamId=${team.id}"
    _submit=reset
    >
    <label for=newPlayer>Add a player</label>
    <fieldset class=nc-join>
        <input
            id=newPlayer
            name=newPlayerName
            type=text
            placeholder="Player name"
            required
            ${when(!team.players.length, "autofocus")}
            _submit=clearAutoFocus>
        <button>Add</button>
    </fieldset>
</form>
`;
}

// The count is of active players only, not subs; editPlayer and addPlayer
// send it back so it stays right as players are toggled or added.
function playersHeading(team: Team) {
  let count = team.players.filter((x) => playerStatus(x) === "active").length;
  return html`<h3 id=players>Players (${count})</h3>`;
}

function playerStatus(player: TeamPlayer): TeamPlayerStatus {
  return !player.active ? "inactive" : player.sub ? "sub" : "active";
}

// Tapping the button moves the player on to the next status.
const statusCycle: [TeamPlayerStatus, string][] = [
  ["active", "Active"],
  ["inactive", "Inactive"],
  ["sub", "Sub"],
];

// One radio per status, with only the checked one's label showing (app.css).
// Each label is for the next status's radio, so a tap checks that one and the
// form submits on change.
function statusToggle(player: TeamPlayer) {
  let current = playerStatus(player);
  let id = (status: TeamPlayerStatus) => `player-status-${player.id}-${status}`;
  return html`
<span class=status-toggle>
    ${statusCycle.map(
      ([status]) =>
        html`<input id="${id(status)}" name=status type=radio value="${status}" $${when(status === current, "checked")}>`,
    )}
    ${statusCycle.map(([status, label], i) => {
      let next = statusCycle[(i + 1) % statusCycle.length][0];
      return html`<label for="${id(next)}" class="is-${status} condense-padding nc-button" role="button">${label}</label>`;
    })}
</span>`;
}

function playerView(player: TeamPlayer, teamId: TeamId) {
  let teamPlayerQuery = `teamId=${teamId}&playerId=${player.id}`;
  let playerId_: string = `edit-player${player.id}`;

  return html`
<li id="active-${playerId_}" class="player-row" hz-target="#playerCards" hz-swap="append">
    <form
        _change=submit
        method=post
        action="?handler=editPlayer&$${teamPlayerQuery}"
        >
        <input
            class=player-number
            name=number
            type=number
            value="${player.number}"
            placeholder="#"
            aria-label="Number">
        <input
            class=player-name-input
            name=name
            type=text
            value="${player.name}"
            placeholder="Player name"
            aria-label="Name">
        ${statusToggle(player)}
    </form>
</li>`;
}

const postHandlers: RoutePostHandler = {
  async editPlayer({ data: d, query: q }) {
    let [{ teamId, playerId }, { name: playerName, status, number }] = await validate([
      validateObject(q, queryTeamIdPlayerIdValidator),
      validateObject(d, dataPlayerNameStatusValidator),
    ]);
    let team = await teamGet(teamId);

    let playerIndex = team.players.findIndex((x) => x.id === playerId);
    await assert.isFalse(playerIndex === -1, `Unknown player "${playerId}"`);
    let player = team.players[playerIndex];

    // Check for duplicates
    let existingPlayer = team.players.find((x) => equals(x.name, playerName));
    await assert.isFalse(
      !equals(player.name, playerName) && !!existingPlayer,
      `The player name "${existingPlayer?.name}" has already been chosen.`,
    );

    player.name = playerName;
    player.active = status !== "inactive";
    if (status === "sub") player.sub = true;
    else delete player.sub;
    player.number = number;
    // Player name will also need to be updated for the individual player when implemented!
    await teamSave(team);

    return { status: 200, body: playersHeading(team) };
  },

  async addPlayer({ data, query }) {
    let [{ teamId }, { newPlayerName }] = await validate([
      validateObject(query, queryTeamIdValidator),
      validateObject(data, { newPlayerName: createString25("Player Name") }),
    ]);

    let team = await teamGet(teamId);

    let existingPlayer = team.players.find((x) => equals(x.name, newPlayerName));
    await assert.isFalse(
      !!existingPlayer,
      `The player name "${existingPlayer?.name}" has already been chosen.`,
    );

    let player = await playerCreate(teamId, newPlayerName);
    team.players.push(player);

    return {
      status: 200,
      body: html`${playerView(player, teamId)}<template id=noPlayers></template>${playersHeading(team)}`,
    };
  },

  async editTeam({ data, query }) {
    let [{ name: newTeamName, year, active }, { teamId }] = await validate([
      validateObject(data, dataTeamNameYearActiveValidator),
      validateObject(query, queryTeamIdValidator),
    ]);

    let team = await teamGet(teamId);
    team.active = active;
    team.year = year;
    team.name = newTeamName;
    await teamSave(team);
    return { status: 200 };
  },
};

const getHandlers: RouteGetHandler = {
  async get({ query }) {
    let result = await start(query);
    return layout({
      main: render(result),
      nav: teamNav(result.team.id),
      title: `Players - ${result.team.name} (${result.team.year})`,
    });
  },
};

const route: RoutePage = {
  get: getHandlers,
  post: postHandlers,
};

export default route;
