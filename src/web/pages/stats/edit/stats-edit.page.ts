import type { RoutePostHandler, RoutePage } from "@jon49/sw/routes.middleware.js"
import type { DbCache as DbCacheType } from "@jon49/sw/utils.js"

const {
    html,
    layout,
    repo: { teamGet, teamSave, statSave, getStatDescription, statsGetAll },
    utils: { when, DbCache },
    validation: { validateObject, createCheckbox, createIdNumber, createString25, required, queryTeamIdValidator },
    views: { teamNav },
} = self.app

async function render(o: StatsView) {
    let [{ stats }, team] = await Promise.all([o.stats(), o.team()])
    let teamId = o.teamId

    return html`
<h2>${team.name} — Stats</h2>

<div class=row>
    ${stats.map(x => {
        let description = getStatDescription(x.id)
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
            $${when(description, () => html`
                <details>
                    <summary>Description</summary>
                    <p>${description}</p>
                </details>`
            )}
        </form>`
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
</div>`
}

const dataStatIdValidator = {
    id: createIdNumber("Stat ID")
}

const statValidator = {
    ...dataStatIdValidator,
    name: createString25("Stat Name"),
    active: createCheckbox,
}

const postHandlers : RoutePostHandler = {
    async updateStat({ query, data }) {
        let { teamId } = await validateObject(query, queryTeamIdValidator)
        let { name, active, id } = await validateObject(data, statValidator)
        let { stats } = await statsGetAll(teamId)
        let o = await required(stats.find(x => x.id === id), "Could not find activity.")

        o.name = name
        o.active = active

        await statSave(teamId, o)

        return { status: 200 }
    },

    async basketballMode({ query, data }) {
        let { teamId } = await validateObject(query, queryTeamIdValidator)
        let { basketballMode } = await validateObject(data, { basketballMode: createCheckbox })
        let team = await teamGet(teamId)
        team.basketballMode = basketballMode
        await teamSave(team)
        return { status: 200 }
    },
}

class StatsView {
    cache: DbCacheType
    teamId: number
    query: any
    constructor(teamId: number, query: any) {
        this.teamId = teamId
        this.cache = new DbCache()
        this.query = query
    }

    async team() {
        return this.cache.get("team", () => teamGet(this.teamId))
    }

    async stats() {
        return this.cache.get("stats", () => statsGetAll(this.teamId))
    }
}

const route : RoutePage = {
    async get({ query }) {
        let { teamId } = await validateObject(query, queryTeamIdValidator)
        let data = new StatsView(teamId, query)
        let team = await data.team()
        return layout({
            main: await render(data),
            nav: teamNav(teamId),
            title: `Stats — ${team.name}`,
        })
    },
    post: postHandlers,
}

export default route

