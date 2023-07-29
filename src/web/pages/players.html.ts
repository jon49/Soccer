import { cache, Message, Team } from "../server/db.js"
import html from "../server/html.js"
import { PostHandlers, Route, RoutePostArgsWithQuery } from "../server/route.js"
import { equals, searchParams } from "../server/utils.js"
import layout from "./_layout.html.js"
import { assert, validate, validateObject } from "../server/validation.js"
import { messageView, when } from "../server/shared.js"
import { dataPlayerNameActiveValidator, dataPlayerNameValidator, dataTeamNameYearActiveValidator, queryTeamIdPlayerIdValidator, queryTeamIdValidator } from "../server/validators.js"
import { playerCreate, teamGet, teamSave } from "../server/repo-team.js"
import { reject } from "../server/repo.js"

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
${when(teamEdited, () => messageView(message))}
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

<p>Add a new player.</p>

${addPlayerForm({ name: undefined, playersExist: true, posted, action, message })}
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

const formId = "add-player"

interface AddPlayerViewArgs {
    name: string | undefined
    posted: string | undefined
    playersExist: boolean
    action?: string
    message: Message
}

export function addPlayerForm({name, posted, playersExist, action, message}: AddPlayerViewArgs) {
    let action_ = action ? html`action="${action}"` : null
    let playerAdded = posted === formId
    return html`
${when(!!message, messageView(message))}
<form class=form method=post ${action_}>
    <div>
        <label for=name>Player Name</label>
        <input id=name name=name type=text value="${name}" $${when(playerAdded || !playersExist, "autofocus")} required>
    </div>
    <button>Save</button>
</form>`
}

export async function addPlayer({ data, query }: RoutePostArgsWithQuery) {
    await cache.push({posted: formId})
    let [{ teamId }, { name }] = await validate([
        validateObject(query, queryTeamIdValidator),
        validateObject(data, dataPlayerNameValidator)
    ])

    let team = await teamGet(teamId)

    let existingPlayer = team.players.find(x => equals(x.name, name))
    await assert.isFalse(!!existingPlayer, `The player name "${existingPlayer?.name}" has already been chosen.`)
        ?.catch(() => reject({ players: { name } }))

    await Promise.all([playerCreate(teamId, name), cache.push({ posted: formId })])
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
    },

    addPlayer: async (o) => {
        await addPlayer(o)
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

