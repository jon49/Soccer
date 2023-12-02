import html from "../../../server/html.js"
import layout from "../../_layout.html.js"
import { PostHandlers, Route } from "../../../server/route.js"
import { teamGet } from "../../../server/repo-team.js"
import { createCheckbox, createIdNumber, createString25, required, validateObject } from "../../../server/validation.js"
import { queryTeamIdValidator } from "../../../server/validators.js"
import { statsGetAll, statSave, getStatDescription } from "../../../server/repo-player-game.js"
import { DbCache, when } from "../../../server/shared.js"
import { teamNav } from "../../_shared-views.js"

async function render(o: StatsView) {
    let [{ stats }, team] = await Promise.all([o.stats(), o.team()])
    let teamId = o.teamId

    return html`
<h2>${team.name} - Stats</h2>

<div class=row>
    ${stats.map(x => {
        let description = getStatDescription(x.id)
        return html`
        <form
            onchange="this.requestSubmit()"
            class=form
            method=post
            action="/web/stats/edit?teamId=${teamId}&handler=updateStat">
            <input type=hidden name=id value="${x.id}">
            <input type=text maxlength=25 name=name value="${x.name}">
            <br>
            <label class=toggle>
                <input type=checkbox name=active $${when(x.active, "checked")}>
                <span class="off button">Inactive</span>
                <span class="on button">Active</span>
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

const postHandlers : PostHandlers = {
    async updateStat({ query, data }) {
        let { teamId } = await validateObject(query, queryTeamIdValidator)
        let { name, active, id } = await validateObject(data, statValidator)
        let { stats } = await statsGetAll(teamId)
        let o = await required(stats.find(x => x.id === id), "Could not find activity.")

        o.name = name
        o.active = active

        await statSave(teamId, o)

        return { status: 204 }
    }
}

class StatsView {
    cache: DbCache
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

const route : Route = {
    route: /\/stats\/edit\/$/,
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

