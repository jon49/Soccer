import type { TeamId } from "../../../data/db.js";
import type { Actions, Page } from "../../../app/page.js";
import { DEFAULT_STALE_AFTER_MINUTES } from "../../match/shared.js";
import html from "html-template-tag-stream";
import { teamGet, teamSave } from "../../../data/repo-team.js";
import { statSave, getStatDescription, statsGetAll } from "../../../data/repo-player-game.js";
import { when, DbCache } from "../../../data/utils.js";
import { validateObject } from "promise-validation";
import {
  createCheckbox,
  createIdNumber,
  createString25,
  createPositiveWholeNumber,
  required,
} from "../../../data/validation.js";
import { queryTeamIdValidator } from "../../../data/validators.js";
import { helpView } from "../../_help-views.js";
import { teamNav } from "../../_shared-views.js";

async function render(o: StatsView) {
  let [{ stats }, team] = await Promise.all([o.stats(), o.team()]);

  return html`
<h2>${team.name}</h2>

${helpView(html`
  <p>
    Each stat can be renamed, and turned <em>Active</em> to count it during matches. With
    <strong>Goal</strong> active, tapping our score in a match asks who scored.
  </p>
  <p><strong>Basketball Mode</strong> lets each score be worth 1, 2 or 3 points.</p>
  <p>
    The <strong>highlight</strong> marks a player who has stayed on the field this long without coming
    off, so nobody plays too long without a rest.
  </p>
`)}

<div class=row>
    ${stats.map((x) => {
      let description = getStatDescription(x.id);
      return html`
        <form _change=updateStat>
            <input type=hidden name=id value="${x.id}">
            <input type=text maxlength=25 name=name value="${x.name}">
            <br>
            <label class=toggle>
                <input type=checkbox name=active $${when(x.active, "checked")}>
                <span class="off nc-button" role="button">Inactive</span>
                <span class="on nc-button" role="button">Active</span>
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

<form _change=basketballMode>
    <input type=hidden name=value value="${team.basketballMode ? 1 : 0}">
    <label class=toggle>
        <input type=checkbox name=basketballMode $${when(team.basketballMode, "checked")}>
        <span class="off nc-button" role="button">Soccer Mode</span>
        <span class="on nc-button" role="button">Basketball Mode</span>
    </label>
</form>

<form _change=staleAfterMinutes>
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

const actions: Actions = {
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

    return "Saved!";
  },

  async basketballMode({ query, data }) {
    let { teamId } = await validateObject(query, queryTeamIdValidator);
    let { basketballMode } = await validateObject(data, { basketballMode: createCheckbox });
    let team = await teamGet(teamId);
    team.basketballMode = basketballMode;
    await teamSave(team);
    return "Saved!";
  },

  async staleAfterMinutes({ query, data }) {
    let { teamId } = await validateObject(query, queryTeamIdValidator);
    let { staleAfterMinutes } = await validateObject(data, {
      staleAfterMinutes: createPositiveWholeNumber("Highlight after minutes"),
    });
    let team = await teamGet(teamId);
    team.staleAfterMinutes = staleAfterMinutes;
    await teamSave(team);
    return "Saved!";
  },
};

class StatsView {
  cache: DbCache;
  teamId: TeamId;
  query: any;
  constructor(teamId: TeamId, query: any) {
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

export default {
  async render({ query }) {
    let { teamId } = await validateObject(query, queryTeamIdValidator);
    let data = new StatsView(teamId, query);
    let team = await data.team();
    return { main: render(data), nav: teamNav(teamId), title: `Stats — ${team.name}` };
  },
  actions,
} satisfies Page;
