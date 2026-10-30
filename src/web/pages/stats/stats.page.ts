import type { RoutePage, RouteGetHandler } from "@jon49/sw/routes.middleware.js";
import { StatsView } from "./shared.js";
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
  views: { teamNav },
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

function tabsView(teamId: TeamId, active: StatTab) {
  return html`
  <nav id=statTabs class=tabs aria-label="Stats">
    ${tabs.map(
      ([handler, label]) =>
        html`<a id="${handler}" href="?teamId=${teamId}&handler=${handler}" $${when(handler === active, `aria-current=page`)}>${label}</a>`,
    )}
  </nav>`;
}

// One table at a time: a tab swaps in its table and marks itself current.
async function tabView(query: any, active: StatTab) {
  let stats = await StatsView.create(query);
  return html`
  ${tabsView(stats.teamId, active)}
  <div id=statTables>${tables[active](stats)}</div>`;
}

async function render(query: any) {
  let { teamId } = await validateObject(query, queryTeamIdValidator);
  let team = await teamGet(teamId);

  return html`
  <h2 class=inline>${team.name}</h2>
  <a href="/web/stats/edit?teamId=${teamId}" target="_self">Edit</a>

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
