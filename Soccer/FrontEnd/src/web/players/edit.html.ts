import { cache, get, Message, set, Team, TeamPlayer, TeamSingle } from "../js/db"
import html from "../js/html-template-tag"
import { handlePost, PostHandlers, Route, RoutePostArgsWithType } from "../js/route"
import { cleanHtmlId, searchParams } from "../js/utils"
import layout from "../_layout.html"
import { assert, required, requiredAsync, validateObject } from "../js/validation"
import { createTeam, findTeamSingle, getOrCreateTeam, getURITeamComponent, messageView, saveTeam, splitTeamName, when } from "../js/shared"
import { dataPlayerNameActiveValidator, dataTeamNameYearActiveValidator, queryTeamPlayerValidator, queryTeamValidator } from "../js/validators"
import { addPlayer, addPlayerForm } from "../js/_AddPayer.html"

export interface TeamView {
    name: string
    year: string
    players: TeamPlayer[]
}

interface PlayersEditView {
    team: TeamView
    aggregateTeam: TeamSingle
    posted?: string
    action: string
    message: Message
}

async function start(req: Request) : Promise<PlayersEditView | undefined> {
    let query = searchParams<{team: string | undefined}>(req)
    let { team: teamName } = await validateObject({ team: query.team }, queryTeamValidator)

    let posted = await cache.pop("posted")
    let message : Message
    if (posted) {
        message = await cache.pop("message")
    }

    let [team, teams] = await Promise.all([
        get<Team>(teamName),
        requiredAsync(get("teams"))])

    let aggregateTeam = await required(findTeamSingle(teams, splitTeamName(teamName)), "Could not find the aggregate team!")

    if (!team) {
        team = createTeam(aggregateTeam)
    }

    query._url.searchParams.append("handler", "addPlayer")

    return {
        team,
        aggregateTeam,
        posted,
        action: query._url.toString(),
        message,
    }
}

function render(o: PlayersEditView | undefined) {
    if (!o?.team) {
        return html``
    }

    let { team, aggregateTeam, posted, message, action } = o
    let teamUriName = getURITeamComponent(team)

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
<form class=form method=post action="?handler=editTeam&team=${teamUriName}">
    <div class=inline>
        <label for=team>Team Name:</label><input id=team name=name type=text value="${team.name}" $${when(teamEdited, "autofocus")}>
    </div>
    <div class=inline>
        <label for=year>Year:</label> <input id=year name=year type=text value="${aggregateTeam.year}">
    </div>
    <div>
        <label for=active>Active</label> <input id=active class=inline name=active type=checkbox $${aggregateTeam.active ? "checked" : null}>
    </div>
    <button>Save</button>
</form>

<h3 id=players>Players Settings</h3>
${team.players.length === 0 ? html`<p>No players have been added.</p>` : null }

<div class=cards>
    ${team.players.map((x, i) => {

        let teamPlayerQuery = `team=${teamUriName}&player=${encodeURIComponent(x.name)}`
        let playerId = `edit-player${i}`
        let playerActiveId : string = `player-active${i}`
        let playerWasEdited = posted === playerId

        return html`
    <div>
        <p id="${cleanHtmlId(x.name)}"><a href="/web/players?${teamPlayerQuery}">${x.name}</a></p>
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
    editPlayer: async ({data: d, query: q}: RoutePostArgsWithType<{name: string, active: string}, {team: string, player: string}>) => {
        let query = await validateObject(q, queryTeamPlayerValidator)
        let { name: playerName, active } = await validateObject(d, dataPlayerNameActiveValidator)
        let team = await requiredAsync(get<Team>(query.team), `Unknown team "${query.team}"`)

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
        await saveTeam(team)
        return
    },

    addPlayer,

    editTeam: async({ data, query }: RoutePostArgsWithType<{name: string, year: string, active?: "on"}, {team: string}>) => {
        let [,{ name: newTeamName, year, active }, query_] = await Promise.all([
            cache.push({posted: "edit-team"}),
            validateObject(data, dataTeamNameYearActiveValidator),
            validateObject(query, queryTeamValidator),
        ])

        let queryTeam = splitTeamName(query_.team)

        let teams = await requiredAsync(get("teams"), `Could not find teams!`)
        let aggregateTeamIndex = teams.findIndex(x => x.name === queryTeam.name && x.year === queryTeam.year)
        await assert.isFalse(aggregateTeamIndex === -1, `Could not find the aggregate team "${queryTeam}"`)
        // Check for duplicates
        await assert.isFalse(
            queryTeam.name !== newTeamName && !!findTeamSingle(teams, {name: newTeamName, year}),
            `The team "${newTeamName}" already exists!`)

        let team : Team = await getOrCreateTeam(query_.team)
        team.name = newTeamName
        team.year = year

        let newSingleTeam: TeamSingle = {
            active,
            name: newTeamName,
            year: year,
        }

        // @ts-ignore
        teams[aggregateTeamIndex] = newSingleTeam
        await Promise.all([saveTeam(team), set("teams", teams)])
        return Response.redirect(`/web/players/edit?team=${getURITeamComponent(team)}`, 303)
    }
}

const route : Route = {
    route: /\/players\/edit\/$/,
    async get(req: Request) {
        let result
        try {
            result = await start(req)
        } catch(x: any) {
            cache.push(x)
        }
        const template = await layout(req)
        return template({ main: render(result) })
    },
    post: handlePost(postHandlers)
}
export default route
