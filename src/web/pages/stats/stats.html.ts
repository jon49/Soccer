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
    <h2>Stats</h2>
    
    <div style="margin-bottom: 1em;">
        <form
            id=stat-buttons
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

    <div id=stat-tables></div>
    <script id="stats-page">
    (() => {
        function removeButton(e) {
            if (e.detail.form.id === "stat-buttons") {
                e.detail.submitter.remove()
            }
        }
        window.app.scripts.set("stats-page", {
            load() {
                document.addEventListener("hf:completed", removeButton)
            },
            unload() {
                document.removeEventListener("hf:completed", removeButton)
            }
        })
    })()
    </script>
    `
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

