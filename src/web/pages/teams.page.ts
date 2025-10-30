import type { Game, Team } from "../server/db.js"
import type { RoutePage, RoutePostHandler } from "@jon49/sw/routes.middleware.js"

const {
    html,
    layout,
    repo: { teamGetAll, teamsCreate },
    utils: { when },
    validation: { dataTeamNameYearValidator, validateObject },
} = self.sw

const render = async () => {
    let {teams, total} = await teamGetAll("active")
    let wasFiltered = total > teams.length

    return html`
<h2>Teams</h2>

${teams ? html`
        <ul id=teams class=list>
            ${teams?.map(x => getTeamView(x))}
        </ul>`
            : html`<p>No teams found. Please add one!</p>`
        }

${wasFiltered ? html`<p><a id=allTeams href="?handler=all">Show all teams.</a></p>` : null}

<h3>Add a team</h3>

<form class=form action="/web/teams" method=post  data-action=reset>
    <div>
        <label for=name>Team Name</label>
        <input
            id=name
            name=name
            type=text
            $${when(!teams?.length, "autofocus")}
            data-action=clearAutoFocus
            required>
    </div>
    <div>
        <label for=year>Year</label>
        <input id=year name=year type=text required value="${new Date().getFullYear()}">
    </div>
    <button>Save</button>
</form>`
}

function getTeamView(team: Team, includeSwap = false) {
    let teamId = team.id
    return html`
    <li $${when(includeSwap, `id="teams" hz-swap="append"`)}>
        <a target="_self" href="/web/players?teamId=${team.id}">${team.name} - ${team.year}</a>
        <a target="_self" href="/web/games?teamId=${team.id}">Games</a>
        ${when((() => {
                let d = new Date()
                let currentDate = `${d.getFullYear()}-${("" + (d.getMonth() + 1)).padStart(2, "0")}-${("" + d.getDate()).padStart(2, "0")}`
                let result = team.games
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .find(x => x.date >= currentDate)
                    return result
            })(),
        (x: Game) => html`<a href="/web/match?teamId=${teamId}&gameId=${x.id}" target="_self">${x.date}</a>`
    ) ?? html`<span>&nbsp;</span>`}
    </li>`
}

const postHandlers: RoutePostHandler = {
    post: async function post({ data }) {
        let d = await validateObject(data, dataTeamNameYearValidator)
        let team = await teamsCreate(d)
        return getTeamView(team, true)
    },
}

const route: RoutePage = {
    get: {
        async get() {
            return layout({
                main: await render(),
                title: "Teams",
            })
        },
        async all() {
            let { teams } = await teamGetAll("inactive")
            return html`
<template id="teams" hz-swap="append">
    ${teams.map(x => getTeamView(x))}
</template>
<template id="allTeams"></template>`
        }
    },

    post: postHandlers,
}

export default route

