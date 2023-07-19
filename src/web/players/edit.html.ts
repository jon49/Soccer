import { cache, Message, Team } from "../server/db"
import html from "../server/html-template-tag"
import { PostHandlers, Route } from "../server/route"
import { equals, searchParams } from "../server/utils"
import layout from "../_layout.html"
import { assert, validate, validateObject } from "../server/validation"
import { messageView, when } from "../server/shared"
import { dataPlayerNameActiveValidator, dataTeamNameYearActiveValidator, queryTeamIdPlayerIdValidator, queryTeamIdValidator } from "../server/validators"
import { addPlayer, addPlayerForm } from "../server/_AddPlayer.html"
import { teamGet, teamSave } from "../server/repo-team"

interface PlayersEditView {
    team: Team
    posted?: string
    action: string
    message: Message
}

async function start(req: Request) : Promise<PlayersEditView> {
    let query = searchParams(req)
    let { teamId } = await validateObject(query, queryTeamIdValidator)

    let [posted, message] = await Promise.all([cache.pop("posted"), cache.pop("message")])

    let team = await teamGet(teamId)

    query._url.searchParams.append("handler", "addPlayer")

    return {
        team,
        posted,
        action: query._url.search,
        message,
    }
}

function render(o: PlayersEditView) {
    let { team, posted, message, action } = o
    let teamEdited = posted === "edit-team"

    return html`
<h2 id=subheading>${ o?.team.name ??  "Unknown"} (${o?.team.year})</h2>

<nav>
    <ul>
        <li><a href="#team">Team</a></li>
        <li><a href="#players">Players</a></li>
    </ul>
</nav>

<h3 id=team>Team Settings</h3>
${teamEdited ? messageView(message) : null}
<form class=form method=post action="?handler=editTeam&teamId=${team.id}" target="#subheading">
    <div class=inline>
        <label for=team>Team Name:</label><input id=team name=name type=text value="${team.name}" $${when(teamEdited, "autofocus")}>
    </div>
    <div class=inline>
        <label for=year>Year:</label> <input id=year name=year type=text value="${team.year}">
    </div>
    <div>
        <label class=toggle>
            <input name=active type=checkbox $${when(team.active, "checked")}>
            <span class="off button">Inactive</span>
            <span class="on button">Active</span>
        </label>
    </div>
</form>

<h3 id=players>Players Settings</h3>
${team.players.length === 0 ? html`<p>No players have been added.</p>` : null }

<div id=player-cards class=cards>
    ${team.players.map(x => playerView(team, x.id))}
</div>

<p>Add a new player.</p>

${addPlayerForm({ name: undefined, playersExist: true, posted, action, message, target: "target=#player-cards hf-swap=append" })}
    `
}

function playerView(team: Team, playerId: number) {
    let player = team.players.find(x => x.id === playerId)
    if (!player) return html`<p>Could not find player "${playerId}"</p>`
    let teamPlayerQuery = `teamId=${team.id}&playerId=${playerId}`
    let playerId_ : string = `edit-player${playerId}`

    return html`
<div>
    <p id="_${playerId}"><a href="/web/players?$${teamPlayerQuery}">${player.name}</a></p>
    <form method=post class=form action="?handler=editPlayer&$${teamPlayerQuery}" target="#_${playerId} > a">
        <div>
            <label for=${playerId_}>Player Name:</label>
            <input id=${playerId_} name=name type=text value="${player.name}">
        </div>
        <div>
            <label class=toggle>
                <input name=active type=checkbox $${player.active ? "checked" : null}>
                <span class="off button">Inactive</span>
                <span class="on button">Active</span>
            </label>
        </div>
    </form>
</div>`
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
        await cache.push({posted: `edit-player${playerIndex}`})
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
        return html`${playerName}`
    },

    addPlayer: async (o) => {
        await addPlayer(o)
        let team = await teamGet(+o.query.teamId)
        return {
            body: playerView(team, team.players.slice(-1)[0].id),
            headers: {
                "hf-events": JSON.stringify({ "reset-form": "" })
            }
        }
    },

    editTeam: async({ data, query }) => {
        await cache.push({posted: "edit-team"})
        let [{ name: newTeamName, year, active }, { teamId }] = await validate([
            validateObject(data, dataTeamNameYearActiveValidator),
            validateObject(query, queryTeamIdValidator),
        ])

        let team = await teamGet(teamId)
        team.active = active
        team.year = year
        team.name = newTeamName
        await teamSave(team)
        return html`${newTeamName} (${year})`
    }
}

const route : Route = {
    route: /\/players\/edit\/$/,
    async get(req: Request) {
        let result = await start(req)
        const template = await layout(req)
        return template({
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
