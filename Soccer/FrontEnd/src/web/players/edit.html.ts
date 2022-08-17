import { cache, get, set, Team, TeamPlayer, TeamSingle } from "../js/db"
import html from "../js/html-template-tag"
import { handlePost, PostHandlers, Route, RoutePostArgsWithType } from "../js/route"
import { cleanHtmlId, searchParams } from "../js/utils"
import layout from "../_layout.html"
import { assert, required, requiredAsync, validateObject } from "../js/validation"
import { createTeam, findTeamSingle, getURITeamComponent, saveTeam, splitTeamName } from "../js/shared"
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
}

async function start(req: Request) : Promise<PlayersEditView | undefined> {
    let query = searchParams<{team: string | undefined}>(req)
    let { team: teamName } = await validateObject({ team: query.team }, queryTeamValidator)

    let posted = await cache.pop("posted")

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
        action: query._url.toString()
    }
}

function render(o: PlayersEditView | undefined) {
    if (!o?.team) {
        return html``
    }

    let { team, aggregateTeam, posted } = o
    let teamUriName = getURITeamComponent(team)

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
<form class=form method=post action="?handler=team&team=${teamUriName}">
    <div class=inline>
        <label for=team>Team Name:</label><input id=team name=name type=text value="${team.name}">
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
${team.players.map((x, i) => {
    let teamPlayerQuery = `team=${teamUriName}&player=${encodeURIComponent(x.name)}`
    let playerId = `player${i}`
    let playerActiveId : string = `player-active${i}`
    return html`
    <p id="${cleanHtmlId(x.name)}"><a href="/web/players?${teamPlayerQuery}">${x.name}</a></p>
    <form method=post class=form action="?handler=player&${teamPlayerQuery}">
        <div>
            <label for=${playerId}>Player Name:</label>
            <input id=${playerId} name=name type=text value="${x.name}">
        </div>
        <div>
            <label for=${playerActiveId}>Active</label>
            <input id=${playerActiveId} class=inline name=active type=checkbox $${x.active ? "checked" : null}>
        </div>
        <button>Save</button>
    </form>
`})}

${addPlayerForm({ name: undefined, playersExist: true, posted, action: o.action })}

<h3 id=positions>Positions Settings</h3>
<p>This is a placeholder for default settings for team play positions. E.g., 1 Keeper, 3 Defenders, 2 Midfielders, 2 Strikers</p>

<h3 id=activities>Activities Settings</h3>
<p>This is a placeholder for activities associated with a player. E.g., the number of goals, number of assists, number of goal saves.</p>
    `
}

const head = `
<style>
    .form {
        border: 1px solid black;
        margin: 5px 0;
        padding: 1em;
    }
</style>
`

const postHandlers: PostHandlers = {
    player: async ({data: d, query: q}: RoutePostArgsWithType<{name: string, active: string}, {team: string, player: string}>) => {
        let query = await validateObject(q, queryTeamPlayerValidator)
        let { name: playerName, active } = await validateObject(d, dataPlayerNameActiveValidator)
        let team = await requiredAsync(get<Team>(query.team), `Unknown team "${query.team}"`)
        let player = await required(team.players.find(x => x.name === query.player), `Unknown player "${query.player}"`)

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

    team: async({ data, query }: RoutePostArgsWithType<{name: string, year: string, active?: "on"}, {team: string}>) => {
        let { name: newTeamName, year, active } = await validateObject(data, dataTeamNameYearActiveValidator)
        let query_ = await validateObject(query, queryTeamValidator)

        let queryTeam = splitTeamName(query_.team)

        let [team, teams] = await Promise.all([
            requiredAsync(get<Team>(query_.team), `Could not find team "${queryTeam.name} - ${queryTeam.year}"!`),
            requiredAsync(get("teams"), `Could not find teams!`)
        ]) 
        let aggregateTeamIndex = teams.findIndex(x => x.name === queryTeam.name && x.year === queryTeam.year)
        await assert.isFalse(aggregateTeamIndex === -1, `Could not find the aggregate team "${queryTeam}"`)
        // Check for duplicates
        await assert.isFalse(
            queryTeam.name !== newTeamName && !!findTeamSingle(teams, {name: newTeamName, year}),
            `The team "${newTeamName}" already exists!`)

        let newTeam : Team = {
            name: newTeamName,
            year,
            players: team.players
        }

        let newSingleTeam: TeamSingle = {
            active,
            name: newTeamName,
            year: year,
        }
        // @ts-ignore
        teams[aggregateTeamIndex] = newSingleTeam
        await Promise.all([saveTeam(newTeam), set("teams", teams)])
        return Response.redirect(`/web/players/edit?team=${getURITeamComponent(newTeam)}`, 303)
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
        return template({
            main: render(result),
            head
        })
    },
    post: handlePost(postHandlers)
}
export default route
