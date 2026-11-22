import type { RoutePage, RouteGetHandler } from "@jon49/sw/routes.middleware.js";
import { StatsView } from "./shared.js";
import type { PlayersShown } from "../../server/utils.js";
import { timePlayedView } from "./_positions-played-view.js";
import { playerPointsView } from "./_player-points-view.js";
import { percentagePlayed } from "./_percentage-played.js";
import type { TeamId } from "../../server/db.js";

const {
  html,
  layout,
  repo: { teamGet },
  utils: { when },
  validation: { validateObject, queryTeamIdValidator },
  views: { helpView, teamNav },
} = self.sw;

type StatTab = "timePlayed" | "percentagePlayed" | "activitiesPerformed";

const tabs: [StatTab, string][] = [
  ["timePlayed", "Time played"],
  ["percentagePlayed", "% played"],
  ["activitiesPerformed", "Points"],
];

const tables: Record<StatTab, (o: StatsView) => Promise<AsyncGenerator<any, void, unknown>>> = {
  timePlayed: timePlayedView,
  percentagePlayed,
  activitiesPerformed: playerPointsView,
};

// The query a tab or a Show / Hide link sends: the tab's table, and which
// players it lists.
function statsQuery(teamId: TeamId, tab: StatTab, show: PlayersShown) {
  let query = `?teamId=${teamId}&handler=${tab}`;
  if (show.subs) query += "&subs=1";
  if (show.inactive) query += "&inactive=1";
  return query;
}

function tabsView(teamId: TeamId, active: StatTab, show: PlayersShown) {
  return html`
  <nav id=statTabs class=tabs aria-label="Stats">
    ${tabs.map(
      ([handler, label]) =>
        html`<a id="${handler}" href="${statsQuery(teamId, handler, show)}" $${when(handler === active, `aria-current=page`)}>${label}</a>`,
    )}
  </nav>`;
}

// Active players are always listed; these add subs or inactive players after
// them, or take them away again, keeping the current tab.
function playersShownView(teamId: TeamId, active: StatTab, show: PlayersShown) {
  let link = (id: string, next: PlayersShown, label: string) =>
    html`<a id="${id}" href="${statsQuery(teamId, active, next)}" role=button class="nc-button condense-padding">${label}</a>`;
  return html`
  <p id=statPlayers class=stat-players>
    ${link("statSubs", { ...show, subs: !show.subs }, show.subs ? "Hide subs" : "Show subs")}
    ${link("statInactive", { ...show, inactive: !show.inactive }, show.inactive ? "Hide inactive" : "Show inactive")}
  </p>`;
}

// One table at a time: a tab swaps in its table and marks itself current.
async function tabView(query: any, active: StatTab) {
  let stats = await StatsView.create(query);
  return html`
  ${tabsView(stats.teamId, active, stats.show)}
  ${playersShownView(stats.teamId, active, stats.show)}
  <div id=statTables>${tables[active](stats)}</div>`;
}

async function render(query: any) {
  let { teamId } = await validateObject(query, queryTeamIdValidator);
  let team = await teamGet(teamId);

  return html`
  <h2 class=inline>${team.name}</h2>
  <a href="/web/stats/edit?teamId=${teamId}" target="_self">Edit</a>

  ${helpView(html`
    <p>
      Stats add up every game the team has played, from the times and scores kept during each match.
    </p>
    <ul>
      <li>
        <strong>Time played</strong>: how long each player was on the field, in total and at each
        position.
      </li>
      <li>
        <strong>% played</strong>: how much of each game a player was on the field, and their average.
      </li>
      <li><strong>Points</strong>: goals and the other stats you count during a match.</li>
    </ul>
    <p>
      The tables list active players by name. <strong>Show subs</strong> and
      <strong>Show inactive</strong> add those players after them.
    </p>
    <p>
      <strong>Edit</strong> chooses which stats are counted, switches to basketball scoring, and sets
      when a player who has been on a long time is highlighted.
    </p>
  `)}

  ${tabView(query, "timePlayed")}`;
}

const getHandler: RouteGetHandler = {
  async get({ query }) {
    return layout({
      main: await render(query),
      nav: teamNav((await validateObject(query, queryTeamIdValidator)).teamId),
      title: "Stats",
    });
  },

  timePlayed: ({ query }) => tabView(query, "timePlayed"),
  percentagePlayed: ({ query }) => tabView(query, "percentagePlayed"),
  activitiesPerformed: ({ query }) => tabView(query, "activitiesPerformed"),
};

const router: RoutePage = {
  get: getHandler,
};

export default router;
