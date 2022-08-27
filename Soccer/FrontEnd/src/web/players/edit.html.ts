import { cache, Message, Team } from "../js/db"
import html from "../js/html-template-tag"
import { handlePost, PostHandlers, Route } from "../js/route"
import { searchParams } from "../js/utils"
import layout from "../_layout.html"
import { assert, validate, validateObject } from "../js/validation"
import { messageView, when } from "../js/shared"
import { dataPlayerNameActiveValidator, dataTeamNameYearActiveValidator, queryTeamPlayerValidator, queryTeamValidator } from "../js/validators"
import { addPlayer, addPlayerForm } from "../js/_AddPlayer.html"
import { teamGet, teamSave } from "../js/repo-team"

interface PlayersEditView {
    team: Team
    posted?: string
    action: string
    message: Message
}

async function start(req: Request) : Promise<PlayersEditView> {
    let query = searchParams(req)
    let { team: teamId } = await validateObject(query, queryTeamValidator)

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
<h2>Team ${ o?.team.name ??  "Unknown"}</h2>

<nav>
    <ul>
        <li><a href="#team">Team</a></li>
        <li><a href="#players">Players</a></li>
        <li><a href="#positions">Positions</a></li>
        <li><a href="#activities">Activities</a></li>
    </ul>
</nav>

<h3 id=team>Team Settings</h3>
${teamEdited ? messageView(message) : null}
<form class=form method=post action="?handler=editTeam&team=${team.id}">
    <div class=inline>
        <label for=team>Team Name:</label><input id=team name=name type=text value="${team.name}" $${when(teamEdited, "autofocus")}>
    </div>
    <div class=inline>
        <label for=year>Year:</label> <input id=year name=year type=text value="${team.year}">
    </div>
    <div>
        <label for=active>Active</label> <input id=active class=inline name=active type=checkbox $${team.active ? "checked" : null}>
    </div>
    <button>Save</button>
</form>

<h3 id=players>Players Settings</h3>
${team.players.length === 0 ? html`<p>No players have been added.</p>` : null }

<div class=cards>
    ${team.players.map((x, i) => {

        let teamPlayerQuery = `team=${team.id}&player=${x.playerId}`
        let playerId = `edit-player${i}`
        let playerActiveId : string = `player-active${i}`
        let playerWasEdited = posted === playerId

        return html`
    <div>
        <p id="${x.playerId}"><a href="/web/players?${teamPlayerQuery}">${x.name}</a></p>
        ${playerWasEdited ? messageView(message) : null}
        <form method=post class=form action="?handler=editPlayer&${teamPlayerQuery}">
            <div>
                <label for=${playerId}>Player Name:</label>
                <input id=${playerId} name=name type=text value="${x.name}" $${when(playerWasEdited, "autofocus")}>
            </div>
            <div>
                <label for=${playerActiveId}>Active</label>
                <input id=${playerActiveId} class=inline name=active type=checkbox $${when(x.active, "checked")}>
            </div>
            <button>Save</button>
        </form>
    </div>
    `})}
</div>

<p>Add a new player.</p>

${addPlayerForm({ name: undefined, playersExist: true, posted, action, message })}

<h3 id=positions>Positions Settings</h3>
<p>This is a placeholder for default settings for team play positions. E.g., 1 Keeper, 3 Defenders, 2 Midfielders, 2 Strikers</p>

<h3 id=activities>Activities Settings</h3>
<p>This is a placeholder for activities associated with a player. E.g., the number of goals, number of assists, number of goal saves.</p>
    `
}

const postHandlers: PostHandlers = {
    editPlayer: async ({data: d, query: q}) => {
        let [query, { name: playerName, active }] = await validate([
            validateObject(q, queryTeamPlayerValidator),
            validateObject(d, dataPlayerNameActiveValidator)
        ])
        let team = await teamGet(query.team)

        let playerIndex = team.players.findIndex(x => x.name === query.player)
        await assert.isFalse(playerIndex === -1, `Unknown player "${query.player}"`)
        await cache.push({posted: `edit-player${playerIndex}`})
        let player = team.players[playerIndex]

        // Check for duplicates
        await assert.isFalse(
            player.name !== playerName && !!team.players.find(x => x.name === playerName),
            `The player name "${playerName}" has already been chosen.`)

        player.name = playerName
        player.active = active
        // Player name will also need to be updated for the individual player when implemented!
        await teamSave(team)
        return
    },

    addPlayer,

    editTeam: async({ data, query }) => {
        await cache.push({posted: "edit-team"})
        let [{ name: newTeamName, year, active }, { team: teamId }] = await validate([
            validateObject(data, dataTeamNameYearActiveValidator),
            validateObject(query, queryTeamValidator),
        ])

        let team = await teamGet(teamId)
        team.active = active
        team.year = year
        team.name = newTeamName
        await teamSave(team)
    }
}

const route : Route = {
    route: /\/players\/edit\/$/,
    async get(req: Request) {
        let result = await start(req)
        const template = await layout(req)
        return template({ main: render(result) })
    },
    post: handlePost(postHandlers)
}
export default route
