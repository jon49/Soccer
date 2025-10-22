import type { RoutePage, RouteGetHandler } from "@jon49/sw/routes.middleware.js"
import { StatsView } from "./shared.js"
import { timePlayedView } from "./_positions-played-view.js"
import { gamesPlayedView } from "./_number-of-games-played-view.js"
import { playerStatsView } from "./_activities-view.js"
import { percentagePlayed } from "./_percentage-played.js"

const {
    html,
    layout,
    repo: { teamGet },
    validation: { validateObject, queryTeamIdValidator },
    views: { teamNav },
} = self.sw

async function render(query: any) {
    let { teamId } = await validateObject(query, queryTeamIdValidator)
    let team = await teamGet(teamId)

    let href = (handler: string) =>
        `href="?teamId=${teamId}&handler=${handler}"`

    return html`
    <h2 class=inline>${team.name} — Stats</h2> <a href="/web/stats/edit?teamId=${teamId}">Edit</a>

    <div style="margin-bottom: 1em;">
        <div
            id=statButtons
            class=grid
            style="--grid-item-width: 150px;">
            ${[
                ["timePlayed", "Time Played"],
                ["percentagePlayed", "Percentage of Games Played"],
                ["gamesPlayed", "Games Played"],
                ["activitiesPerformed", "Player Stats"],
            ].map(([handler, label]) =>
             html`<a id="${handler}" $${href(handler)} role="button" target=htmz>$${label}</a>`)
            }
        </div>
    </div>

    <div id=statTables></div>`
}

const getHandler: RouteGetHandler = {
    async get({ query }) {
        return layout({
            head: `<style>
            table.sticky {
                th {
                    position: sticky;
                    top: 0;
                    z-index: 2;
                }

                td:first-child, th:first-child {
                    position: sticky;
                    left: 0;
                    z-index: 1;
                }
            }
            </style>`,
            main: await render(query),
            nav: teamNav(+query.teamId),
            title: "Player Stats"
        })
    },

    async timePlayed({ query }) {
        let playersView = await StatsView.create(query)
        return html`
        <template hz-target="#statTables" hz-swap="prepend">${timePlayedView(playersView)}</template>
        <template id=timePlayed></template>`
    },

    async percentagePlayed({ query }) {
        let playersView = await StatsView.create(query)
        return html`
        <template hz-target="#statTables" hz-swap="prepend">${percentagePlayed(playersView)}</template>
        <template id=percentagePlayed></template>`
    },

    async gamesPlayed({ query }) {
        let playersView = await StatsView.create(query)
        return html`
        <template hz-target="#statTables" hz-swap="prepend">${gamesPlayedView(playersView)}</template>
        <template id=gamesPlayed></template>`
    },

    async activitiesPerformed({ query }) {
        let playersView = await StatsView.create(query)
        return html`
        <template hz-target="#statTables" hz-swap="prepend">${playerStatsView(playersView)}</template>
        <template id=activitiesPerformed></template>`
    }
}

const router: RoutePage = {
    get: getHandler
}

export default router

