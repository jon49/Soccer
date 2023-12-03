import { validateObject } from "promise-validation"
import html from "../../server/html.js"
import { Route, RouteGetHandler } from "../../server/route.js"
import layout from "../_layout.html.js"
import { queryTeamIdValidator } from "../../server/validators.js"
import { teamNav } from "../_shared-views.js"
import { StatsView } from "./shared.js"
import { timePlayedView } from "./_positions-played-view.js"
import { gamesPlayedView } from "./_number-of-games-played-view.js"
import { playerStatsView } from "./_activities-view.js"

async function render(query: any) {
    let { teamId } = await validateObject(query, queryTeamIdValidator)

    let formAction = (handler: string) =>
        `formaction="/web/stats?teamId=${teamId}&handler=${handler}"`

    return html`
    <h2 class=inline>Stats</h2> <a href="/web/stats/edit?teamId=${teamId}">Edit</a>

    <div style="margin-bottom: 1em;">
        <form
            id=stat-buttons

            is=form-subscribe
            data-event="hf:completed"
            data-match="detail: {form:{id:'stat-buttons'}}"
            data-action="event.target.remove()"

            hf-target="#stat-tables"
            hf-swap="prepend"
            >
            ${[
                ["timePlayed", "Time Played"],
                ["gamesPlayed", "Games Played"],
                ["activitiesPerformed", "Player Stats"],
            ].map(([handler, label]) =>
             html`<button $${formAction(handler)}>$${label}</button>`)
            }
        </form>
    </div>

    <div id=stat-tables></div>`
}

const getHandler: RouteGetHandler = {
    async get({ query }) {
        return layout({
            main: await render(query),
            nav: teamNav(+query.teamId),
            title: "Player Stats"
        })
    },

    async timePlayed({ query }) {
        let playersView = await StatsView.create(query)
        return timePlayedView(playersView)
    },
    
    async gamesPlayed({ query }) {
        let playersView = await StatsView.create(query)
        return gamesPlayedView(playersView)
    },

    async activitiesPerformed({ query }) {
        let playersView = await StatsView.create(query)
        return playerStatsView(playersView)
    }
}

const router: Route = {
    route: /\/stats\/$/,
    get: getHandler
}

export default router

