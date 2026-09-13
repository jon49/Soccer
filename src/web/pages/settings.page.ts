import type { RoutePage, RoutePostHandler } from "@jon49/sw/routes.middleware.js";
import { entries } from "idb-keyval";

const {
  globalDb,
  html,
  layout,
  repo: { teamGet, teamGetAll, gameStateGet, gameStateSave, playerGameAllGet, playerGameSave },
  utils: { when },
  validation: { validateObject, createIdNumber },
  views: { themeView },
} = self.sw;

const dataTeamIdGameIdValidator = {
  teamId: createIdNumber("Team ID"),
  gameId: createIdNumber("Game ID"),
};

interface ResyncTeamOption {
  id: number;
  name: string;
  year: string;
  active: boolean;
  games: { id: number; date: string; opponent?: string }[];
}

// The whole team/game picker runs client-side off data already in this
// page — no round trip needed, this app is offline-first. Built as one JS
// string (rather than the `html` tagged template) because it's interpolated
// raw via `$${}` — the auto-escaping `${}` form would mangle the `<=`/`>`
// comparisons below into HTML entities.
function forceResyncScript(teams: ResyncTeamOption[]): string {
  let json = JSON.stringify(teams).replace(/</g, "\\u003c");
  return `(function () {
    var teams = ${json};
    var teamSelect = document.getElementById("forceResyncTeamId");
    var gameSelect = document.getElementById("forceResyncGameId");
    var showAllTeams = document.getElementById("forceResyncShowAllTeams");

    function todayIso() {
      var d = new Date();
      var month = String(d.getMonth() + 1).padStart(2, "0");
      var day = String(d.getDate()).padStart(2, "0");
      return d.getFullYear() + "-" + month + "-" + day;
    }

    function addOption(select, value, text) {
      var opt = document.createElement("option");
      opt.value = value;
      opt.textContent = text;
      select.appendChild(opt);
      return opt;
    }

    function addGroup(select, label, games) {
      if (!games.length) return;
      var group = document.createElement("optgroup");
      group.label = label;
      select.appendChild(group);
      games.forEach(function (g) {
        addOption(group, String(g.id), g.date + (g.opponent ? " vs " + g.opponent : ""));
      });
    }

    function renderGames(teamId) {
      gameSelect.innerHTML = "";
      var team = teams.find(function (t) { return String(t.id) === String(teamId); });
      if (!team || !team.games.length) {
        gameSelect.disabled = true;
        addOption(gameSelect, "", team ? "No games for this team" : "Select a team first");
        return;
      }
      gameSelect.disabled = false;
      var today = todayIso();
      var played = team.games
        .filter(function (g) { return g.date <= today; })
        .sort(function (a, b) { return b.date.localeCompare(a.date); });
      var upcoming = team.games
        .filter(function (g) { return g.date > today; })
        .sort(function (a, b) { return a.date.localeCompare(b.date); });
      addGroup(gameSelect, "Played", played);
      addGroup(gameSelect, "Upcoming", upcoming);
    }

    function renderTeams() {
      var showAll = showAllTeams.checked;
      var current = teamSelect.value;
      teamSelect.innerHTML = "";
      addOption(teamSelect, "", "Select a team");
      teams.forEach(function (t) {
        if (!showAll && !t.active) return;
        addOption(teamSelect, String(t.id), t.name + " - " + t.year);
      });
      var stillPresent = Array.prototype.some.call(teamSelect.options, function (o) {
        return o.value === current;
      });
      teamSelect.value = stillPresent ? current : "";
      renderGames(teamSelect.value);
    }

    teamSelect.addEventListener("change", function () { renderGames(teamSelect.value); });
    showAllTeams.addEventListener("change", renderTeams);
    renderTeams();
  })();`;
}

const render = async () => {
  let [{ disableAutoSyncDuringGame }, { teams }] = await Promise.all([
    globalDb.settings(),
    teamGetAll("all"),
  ]);

  let resyncPickerData: ResyncTeamOption[] = teams.map((team) => ({
    id: team.id,
    name: team.name,
    year: team.year,
    active: team.active,
    games: team.games.map((game) => ({ id: game.id, date: game.date, opponent: game.opponent })),
  }));

  return html`
<h2>Settings</h2>

<form class=form method=post action="/web/settings?handler=autoSync" onchange="this.submit()">
  <div>
    <label>
      <input
          type=checkbox
          name=disableAutoSyncDuringGame
          $${when(disableAutoSyncDuringGame, "checked")}>
      Disable auto-sync during games
    </label>
    <p class=muted>
      When on, the app will not auto-sync while you are on a match page. You
      can still tap the sync button to sync manually.
    </p>
  </div>
</form>

<h3>Data</h3>
<p><a href="/web/settings?handler=export" role="button" target="_self">Download data as JSON</a></p>
<p>Saves all synced app data to a JSON file on your device.</p>

<h3>Force Resync a Game</h3>
<p class=muted>
  If a game's data doesn't seem to have reached the server (e.g. it still
  shows as in-progress on another device after you ended it here), use this
  to re-queue that game's records for sync without changing their content.
  Then tap the sync button.
</p>
<form class=form method=post action="/web/settings?handler=forceResyncGame" id=forceResyncForm>
  <div>
    <label>
      <input type=checkbox id=forceResyncShowAllTeams>
      Include inactive teams
    </label>
  </div>
  <div>
    <label for=forceResyncTeamId>Team</label>
    <select id=forceResyncTeamId name=teamId required>
      <option value="">Select a team</option>
    </select>
  </div>
  <div>
    <label for=forceResyncGameId>Game</label>
    <select id=forceResyncGameId name=gameId required disabled>
      <option value="">Select a team first</option>
    </select>
  </div>
  <button type=submit>Queue for resync</button>
</form>
<script>
  $${forceResyncScript(resyncPickerData)}
</script>
`;
};

async function exportData() {
  let all = await entries();
  let data: Record<string, unknown> = {};
  for (let [k, v] of all) {
    if (!v || typeof v !== "object" || !("_rev" in v)) continue;
    let key = Array.isArray(k) ? JSON.stringify(k) : String(k);
    data[key] = v;
  }
  let json = JSON.stringify(data, (_, v) => (v instanceof Set ? Array.from(v) : v), 2);
  let filename = `soccer-data-${new Date().toISOString().slice(0, 10)}.json`;
  return {
    body: json,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  };
}

const postHandlers: RoutePostHandler = {
  async theme({ data }) {
    const submitted = (data as { theme?: string } | undefined)?.theme;
    const theme = submitted === "dark" ? "dark" : "light";

    await globalDb.setTheme(theme);

    return {
      status: 200,
      body: html`${themeView(theme)}`,
    };
  },

  async autoSync({ data }) {
    let submitted = (data as { disableAutoSyncDuringGame?: string } | undefined)
      ?.disableAutoSyncDuringGame;
    let disable = submitted === "on" || submitted === "true";

    let current = await globalDb.settings();
    await globalDb.setSettings({ ...current, disableAutoSyncDuringGame: disable });

    return { status: 204 };
  },

  // Re-marks a game's records as needing sync without touching their
  // content — recovers from a local edit that was queued for sync but never
  // actually got sent (e.g. a race where a new edit lands in the pending
  // queue between one sync round's request and its response).
  async forceResyncGame({ data }) {
    let { teamId, gameId } = await validateObject(data, dataTeamIdGameIdValidator);

    let team = await teamGet(teamId);
    let [gameState, players] = await Promise.all([
      gameStateGet(teamId, gameId),
      playerGameAllGet(
        teamId,
        gameId,
        team.players.map((x) => x.id),
      ),
    ]);

    await gameStateSave(teamId, gameState);
    let existingPlayers = players.filter((x) => x._rev > 0);
    await Promise.all(existingPlayers.map((player) => playerGameSave(teamId, player)));

    return {
      status: 200,
      message: `Queued ${1 + existingPlayers.length} record(s) for game ${gameId} to resync.`,
    };
  },
};

const route: RoutePage = {
  get: {
    async get() {
      return layout({
        main: await render(),
        title: "Settings",
      });
    },
    export: exportData,
  },
  post: postHandlers,
};

export default route;
