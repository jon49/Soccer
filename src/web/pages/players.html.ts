import { Team } from "../server/db.js"
import html from "../server/html.js"
import { PostHandlers, Route, RoutePostArgsWithQuery } from "../server/route.js"
import { equals, searchParams } from "../server/utils.js"
import layout from "./_layout.html.js"
import { assert, validate, validateObject } from "../server/validation.js"
import { when } from "../server/shared.js"
import { dataPlayerNameActiveValidator, dataPlayerNameValidator, dataTeamNameYearActiveValidator, queryTeamIdPlayerIdValidator, queryTeamIdValidator } from "../server/validators.js"
import { playerCreate, teamGet, teamSave } from "../server/repo-team.js"

interface PlayersEditView {
    team: Team
    action: string
}

async function start(req: Request) : Promise<PlayersEditView> {
    let query = searchParams(req)
    let { teamId } = await validateObject(query, queryTeamIdValidator)

    let team = await teamGet(teamId)

    query._url.searchParams.append("handler", "addPlayer")

    return {
        team,
        action: query._url.search,
    }
}

function render(o: PlayersEditView) {
    let { team, action } = o

    return html`
<h2 id=subheading>${ o?.team.name ??  "Unknown"} (${o?.team.year})</h2>

<nav>
    <ul>
        <li><a href="#team">Team</a></li>
        <li><a href="#players">Players</a></li>
    </ul>
</nav>

<h3 id=team>Team Settings</h3>
<form class=form method=post action="?handler=editTeam&teamId=${team.id}">
    <div class=inline>
        <label for=team>Team Name:</label><input id=team name=name type=text value="${team.name}">
    </div>
    <div class=inline>
        <label for=year>Year:</label> <input id=year name=year type=text value="${team.year}">
    </div>
    <div>
        <label class=toggle>
            <input id=team-active name=active type=checkbox $${when(team.active, "checked")}>
            <span class="off button">Inactive</span>
            <span class="on button">Active</span>
        </label>
    </div>
</form>

<h3 id=players>Players Settings</h3>
${team.players.length === 0 ? html`<p>No players have been added.</p>` : null }

<div id=player-cards  class=cards>
    ${team.players.map(x => playerView(team, x.id))}
</div>

${addPlayerForm({ name: undefined, action })}
    `
}

function playerView(team: Team, playerId: number) {
    let player = team.players.find(x => x.id === playerId)
    if (!player) return html`<p>Could not find player "${playerId}"</p>`
    let teamPlayerQuery = `teamId=${team.id}&playerId=${playerId}`
    let playerId_ : string = `edit-player${playerId}`

    return html`
<div>
    <form method=post action="?handler=editPlayer&$${teamPlayerQuery}">
        <div>
            <input id=${playerId_} class=editable name=name type=text value="${player.name}">
            <label for=${playerId_}><a href="/web/players?$${teamPlayerQuery}">${player.name}</a> <span class=editable-pencil>&#9998;</span></label>
        </div>
        <div>
            <label class=toggle>
                <input id="active-${playerId_}" name=active type=checkbox $${when(player.active, "checked")}>
                <span class="off button">Inactive</span>
                <span class="on button">Active</span>
            </label>
        </div>
    </form>
</div>`
}

interface AddPlayerViewArgs {
    name: string | undefined
    action?: string
}

export function addPlayerForm({name, action}: AddPlayerViewArgs) {
    return html`
<br>
<form class=form method=post ${action && html`action="${action}"` || null}>
    <div>
        <label for=name>Player Name</label>
        <input id=name name=name type=text value="${name}" required>
    </div>
    <button>Save</button>
</form>`
}

export async function addPlayer({ data, query }: RoutePostArgsWithQuery) {
    let [{ teamId }, { name }] = await validate([
        validateObject(query, queryTeamIdValidator),
        validateObject(data, dataPlayerNameValidator)
    ])

    let team = await teamGet(teamId)

    let existingPlayer = team.players.find(x => equals(x.name, name))
    await assert.isFalse(!!existingPlayer, `The player name "${existingPlayer?.name}" has already been chosen.`)

    await playerCreate(teamId, name)
}

const postHandlers: PostHandlers = {
    editPlayer: async ({data: d, query: q}) => {
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
    },

    addPlayer: async (o) => {
        await addPlayer(o)
    },

    editTeam: async({ data, query }) => {
        let [{ name: newTeamName, year, active }, { teamId }] = await validate([
            validateObject(data, dataTeamNameYearActiveValidator),
            validateObject(query, queryTeamIdValidator),
        ])

        let team = await teamGet(teamId)
        team.active = active
        team.year = year
        team.name = newTeamName
        await teamSave(team)
    }
}

const route : Route = {
    route: /\/players\/$/,
    async get(req: Request) {
        let result = await start(req)
        return layout(req, {
            head: "<style>.player-card { min-width: 200px; }</style>",
            main: render(result),
            nav: [
                { name: "Positions", url: `/web/positions?teamId=${result.team.id}` },
                { name: "Activities", url: `/web/activities?teamId=${result.team.id}` }
            ],
            scripts: ["/web/js/players-edit.js"] })
    },
    post: postHandlers
}

export default route

