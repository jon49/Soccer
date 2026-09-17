import type { RoutePostHandler, RoutePage } from "@jon49/sw/routes.middleware.js";
import type { DbCache as DbCacheType } from "@jon49/sw/utils.js";
import { DEFAULT_STALE_AFTER_MINUTES } from "../../match/shared.js";

const {
  html,
  layout,
  repo: { teamGet, teamSave, statSave, getStatDescription, statsGetAll },
  utils: { when, DbCache },
  validation: {
    validateObject,
    createCheckbox,
    createIdNumber,
    createString25,
    createPositiveWholeNumber,
    required,
    queryTeamIdValidator,
  },
  views: { teamNav },
} = self.sw;

async function render(o: StatsView) {
  let [{ stats }, team] = await Promise.all([o.stats(), o.team()]);
  let teamId = o.teamId;

  return html`
<h2>${team.name} — Stats</h2>

<div class=row>
    ${stats.map((x) => {
      let description = getStatDescription(x.id);
      return html`
        <form
            _change=submit
            method=post
            action="?teamId=${teamId}&handler=updateStat">
            <input type=hidden name=id value="${x.id}">
            <input type=text maxlength=25 name=name value="${x.name}">
            <br>
            <label class=toggle>
                <input type=checkbox name=active $${when(x.active, "checked")}>
                <span class="off" role="button">Inactive</span>
                <span class="on" role="button">Active</span>
            </label>
            <br>
            <br>
            $${when(
              description,
              () => html`
                <details>
                    <summary>Description</summary>
                    <p>${description}</p>
                </details>`,
            )}
        </form>`;
    })}

<form
    _change=submit
    method=post
    action="?teamId=${teamId}&handler=basketballMode">
    <input type=hidden name=value value="${team.basketballMode ? 1 : 0}">
    <label class=toggle>
        <input type=checkbox name=basketballMode $${when(team.basketballMode, "checked")}>
        <span class="off" role="button">Soccer Mode</span>
        <span class="on" role="button">Basketball Mode</span>
    </label>
</form>

<form
    _change=submit
    method=post
    action="?teamId=${teamId}&handler=staleAfterMinutes">
    <label for=staleAfterMinutes>
        Highlight players in a position for this many minutes without a
        substitution
    </label>
    <input
        id=staleAfterMinutes
        type=number
        min=0
        name=staleAfterMinutes
        value="${team.staleAfterMinutes ?? DEFAULT_STALE_AFTER_MINUTES}">
    <small>Set to 0 to turn the highlight off.</small>
</form>
</div>`;
}

const dataStatIdValidator = {
  id: createIdNumber("Stat ID"),
};

const statValidator = {
  ...dataStatIdValidator,
  name: createString25("Stat Name"),
  active: createCheckbox,
};

const postHandlers: RoutePostHandler = {
  async updateStat({ query, data }) {
    let { teamId } = await validateObject(query, queryTeamIdValidator);
    let { name, active, id } = await validateObject(data, statValidator);
    let { stats } = await statsGetAll(teamId);
    let o = await required(
      stats.find((x) => x.id === id),
      "Could not find activity.",
    );

    o.name = name;
    o.active = active;

    await statSave(teamId, o);

    return { status: 200 };
  },

  async basketballMode({ query, data }) {
    let { teamId } = await validateObject(query, queryTeamIdValidator);
    let { basketballMode } = await validateObject(data, { basketballMode: createCheckbox });
    let team = await teamGet(teamId);
    team.basketballMode = basketballMode;
    await teamSave(team);
    return { status: 200 };
  },

  async staleAfterMinutes({ query, data }) {
    let { teamId } = await validateObject(query, queryTeamIdValidator);
    let { staleAfterMinutes } = await validateObject(data, {
      staleAfterMinutes: createPositiveWholeNumber("Highlight after minutes"),
    });
    let team = await teamGet(teamId);
    team.staleAfterMinutes = staleAfterMinutes;
    await teamSave(team);
    return { status: 200 };
  },
};

class StatsView {
  cache: DbCacheType;
  teamId: number;
  query: any;
  constructor(teamId: number, query: any) {
    this.teamId = teamId;
    this.cache = new DbCache();
    this.query = query;
  }

  async team() {
    return this.cache.get("team", () => teamGet(this.teamId));
  }

  async stats() {
    return this.cache.get("stats", () => statsGetAll(this.teamId));
  }
}

const route: RoutePage = {
  async get({ query }) {
    let { teamId } = await validateObject(query, queryTeamIdValidator);
    let data = new StatsView(teamId, query);
    let team = await data.team();
    return layout({
      main: await render(data),
      nav: teamNav(teamId),
      title: `Stats — ${team.name}`,
    });
  },
  post: postHandlers,
};

export default route;
