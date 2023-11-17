import { Team } from "../server/db.js"
import html from "../server/html.js"
import { PostHandlers, Route } from "../server/route.js"
import { equals } from "../server/utils.js"
import layout from "./_layout.html.js"
import { assert, validate, validateObject } from "../server/validation.js"
import { when } from "../server/shared.js"
import { dataPlayerNameActiveValidator, dataPlayerNameValidator, dataTeamNameYearActiveValidator, queryTeamIdPlayerIdValidator, queryTeamIdValidator } from "../server/validators.js"
import { playerCreate, teamGet, teamSave } from "../server/repo-team.js"
import { teamNav } from "./_shared-views.js"

interface PlayersEditView {
    team: Team
}

async function start(query: any): Promise<PlayersEditView> {
    let { teamId } = await validateObject(query, queryTeamIdValidator)

    let team = await teamGet(teamId)

    return { team }
}

function render(o: PlayersEditView) {
    let { team } = o

    return html`
<h2 id=subheading>${o?.team.name ?? "Unknown"} (${o?.team.year})</h2>

<nav>
    <ul>
        <li><a href="#team">Team</a></li>
        <li><a href="#players">Players</a></li>
    </ul>
</nav>

<h3 id=team>Team Settings</h3>
<form class=form method=post action="/web/players?handler=editTeam&teamId=${team.id}" hf-target=main>
    <div class=inline>
        <label for=team-input>Team Name:</label><input id=team-input name=name type=text value="${team.name}">
    </div>
    <div class=inline>
        <label for=year-input>Year:</label> <input id=year-input name=year type=text value="${team.year}">
    </div>
    <div id=team-active>
        <label class=toggle>
            <input name=active type=checkbox $${when(team.active, "checked")}>
            <span class="off button">Inactive</span>
            <span class="on button">Active</span>
        </label>
    </div>
</form>

<h3 id=players>Players Settings</h3>
${team.players.length === 0 ? html`<p>No players have been added.</p>` : null}

<div id=player-cards  class=cards>
    ${team.players.map(x => playerView(team, x.id))}
</div>

<form class=form method=post action="/web/players?handler=addPlayer&teamId=${team.id}" hf-target=main>
    <div>
        <label for=new-player>Player Name</label>
        <input id=new-player name=name type=text required ${when(!team.players.length, "autofocus")}>
    </div>
    <button>Save</button>
</form>
`
}

function playerView(team: Team, playerId: number) {
    let player = team.players.find(x => x.id === playerId)
    if (!player) return html`<p>Could not find player "${playerId}"</p>`
    let teamPlayerQuery = `teamId=${team.id}&playerId=${playerId}`
    let playerId_: string = `edit-player${playerId}`

    return html`
<div id="active-${playerId_}">
    <form method=post action="/web/players?handler=editPlayer&$${teamPlayerQuery}" hf-target=main>
        <div>
            <input id=${playerId_} class=editable name=name type=text value="${player.name}">
            <label for=${playerId_}><a href="/web/players?$${teamPlayerQuery}">${player.name}</a> <span class="editable-pencil float-right">&#9998;</span></label>
        </div>
        <div>
            <label class=toggle>
                <input
                    name=active
                    type=checkbox
                    $${when(player.active, "checked")}>
                <span class="off button full-width">Inactive</span>
                <span class="on button full-width">Active</span>
            </label>
        </div>
    </form>
</div>`
}

async function renderMain(query: any) {
    return render(await start(query))
}

const postHandlers: PostHandlers = {
    async editPlayer({ data: d, query: q }) {
        let [{ teamId, playerId }, { name: playerName, active }] = await validate([
            validateObject(q, queryTeamIdPlayerIdValidator),
            validateObject(d, dataPlayerNameActiveValidator)
        ])
        let team = await teamGet(teamId)

        let playerIndex = team.players.findIndex(x => x.id === playerId)
        await assert.isFalse(playerIndex === -1, `Unknown player "${playerId}"`)
        let player = team.players[playerIndex]

        // Check for duplicates
        let existingPlayer = team.players.find(x => equals(x.name, playerName))
        await assert.isFalse(
            !equals(player.name, playerName) && !!existingPlayer,
            `The player name "${existingPlayer?.name}" has already been chosen.`)

        player.name = playerName
        player.active = active
        // Player name will also need to be updated for the individual player when implemented!
        await teamSave(team)

        return renderMain(q)
    },

    async addPlayer({ data, query }) {
        let [{ teamId }, { name }] = await validate([
            validateObject(query, queryTeamIdValidator),
            validateObject(data, dataPlayerNameValidator)
        ])

        let team = await teamGet(teamId)

        let existingPlayer = team.players.find(x => equals(x.name, name))
        await assert.isFalse(!!existingPlayer, `The player name "${existingPlayer?.name}" has already been chosen.`)

        await playerCreate(teamId, name)
        return renderMain(query)
    },

    async editTeam({ data, query }) {
        let [{ name: newTeamName, year, active }, { teamId }] = await validate([
            validateObject(data, dataTeamNameYearActiveValidator),
            validateObject(query, queryTeamIdValidator),
        ])

        let team = await teamGet(teamId)
        team.active = active
        team.year = year
        team.name = newTeamName
        await teamSave(team)
        return renderMain(query)
    }
}

const route: Route = {
    route: /\/players\/$/,
    async get({ query }) {
        let result = await start(query)
        return layout({
            head: "<style>.player-card { min-width: 200px; }</style>",
            main: render(result),
            nav: teamNav(result.team.id),
            scripts: ["/web/js/players-edit.js"],
            title: `Players - ${result.team.name} (${result.team.year})}`
        })
    },
    post: postHandlers
}

export default route

