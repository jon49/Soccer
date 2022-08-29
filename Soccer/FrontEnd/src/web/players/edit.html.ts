import { cache, Message, Team } from "../js/db"
import html from "../js/html-template-tag"
import { handlePost, PostHandlers, Route } from "../js/route"
import { searchParams } from "../js/utils"
import layout from "../_layout.html"
import { assert, validate, validateObject } from "../js/validation"
import { messageView, when } from "../js/shared"
import { dataPlayerNameActiveValidator, dataTeamNameYearActiveValidator, queryTeamIdPlayerIdValidator, queryTeamIdValidator } from "../js/validators"
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
        <label for=active>Active</label> <input id=active class=inline name=active type=checkbox $${team.active ? "checked" : null}>
    </div>
    <button class=hidden></button>
</form>

<h3 id=players>Players Settings</h3>
${team.players.length === 0 ? html`<p>No players have been added.</p>` : null }

<div class=cards>
    ${team.players.map((x, i) => {

        let teamPlayerQuery = `teamId=${team.id}&playerId=${x.playerId}`
        let playerId : string = `edit-player${i}`
        let playerActiveId : string = `player-active${i}`
        let playerWasEdited = posted === playerId

        return html`
    <div>
        <p id="_${x.playerId}"><a href="/web/players?${teamPlayerQuery}">${x.name}</a></p>
        ${playerWasEdited ? messageView(message) : null}
        <form method=post class=form action="?handler=editPlayer&${teamPlayerQuery}" target="#_${x.playerId} > a">
            <div>
                <label for=${playerId}>Player Name:</label>
                <input id=${playerId} name=name type=text value="${x.name}" $${when(playerWasEdited, "autofocus")}>
            </div>
            <div>
                <label for=${playerActiveId}>Active</label>
                <input id=${playerActiveId} class=inline name=active type=checkbox $${when(x.active, "checked")}>
            </div>
            <button class=hidden></button>
        </form>
    </div>
    `})}
</div>

<p>Add a new player.</p>

${addPlayerForm({ name: undefined, playersExist: true, posted, action, message })}

<script>
    document.addEventListener("change", e => {
        hf.click(e.target)
    })
</script>
    `
}

const postHandlers: PostHandlers = {
    editPlayer: async ({data: d, query: q}) => {
        let [{ teamId, playerId }, { name: playerName, active }] = await validate([
            validateObject(q, queryTeamIdPlayerIdValidator),
            validateObject(d, dataPlayerNameActiveValidator)
        ])
        let team = await teamGet(teamId)

        let playerIndex = team.players.findIndex(x => x.playerId === playerId)
        await assert.isFalse(playerIndex === -1, `Unknown player "${playerId}"`)
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
        return html`${playerName}`
    },

    addPlayer,

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
        return template({ main: render(result), scripts: ["/web/js/lib/htmf-all.min.js"] })
    },
    post: handlePost(postHandlers)
}
export default route
