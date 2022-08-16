import { cache, get, set, Team, TeamPlayer, TeamSingle } from "../js/db"
import html from "../js/html-template-tag"
import { handlePost, PostHandlers, Route, RoutePostArgsWithType } from "../js/route"
import { searchParams } from "../js/utils"
import layout from "../_layout.html"
import { assert, createCheckbox, createString50, required, requiredAsync, validate, validateObject } from "../js/validation"

export interface TeamView {
    name?: string
    players: TeamPlayer[]
}

interface PlayersEditView {
    team: TeamView
    aggregateTeam: TeamSingle
}

async function start(req: Request) : Promise<PlayersEditView | undefined> {
    let query = searchParams<{team: string | null}>(req)
    let teamName = query.team?.trim()
    if (!teamName) {
        await cache.push({message: "Team name is required!"})
        return
    }
    let [team, teams] = await Promise.all([get<Team>(teamName), get("teams")])
    if (!team) {
        await cache.push({message: "Players must be added to the team before editing a team!"})
        return
    }
    let aggregateTeam = teams?.find(x => x.name === teamName)
    if (!aggregateTeam) {
        await cache.push({message: "Could not find the aggregate team!"})
        return
    }

    return {
        team,
        aggregateTeam,
    }
}

function render(o: PlayersEditView | undefined) {
    if (!o?.team) {
        return html``
    }

    let { team, aggregateTeam } = o
    let teamUriName = encodeURIComponent(team.name ?? "")

    return html`
<h2>Team ${ o?.team.name ??  "Unknown"}</h2>
<form class=form method=post action="?handler=team&team=${teamUriName}">
    <div>
        <label for=team>Team Name:</label><input id=team name=team type=text value="${team.name}">
    </div>
    <div>
        <label for=year>Year:</label> <input id=year name=year type=text value="${aggregateTeam.year}">
    </div>
    <div>
        <label for=active>Active</label> <input id=active name=active type=checkbox $${aggregateTeam.active ? "checked" : null}>
    </div>
    <button>Save</button>
</form>
${team.players.map(x => {
    return html`
    <form method=post class=form action="?handler=player&team=${teamUriName}&player=${x.name}">
        <div>
            <label for=player>Player Name:</label>
            <input id=player name=player type=text value="${x.name}">
        </div>
        <div>
            <label for=active>Active</label>
            <input id=active class=inline name=active type=checkbox $${x.active ? "checked" : null}>
        </div>
        <button>Save</button>
    </form>
`})}
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

const teamStringValueObject = {
    team: createString50("Team Name")
}
const teamSingleValueObject = {
    ...teamStringValueObject,
    year: createString50("Year"),
    active: createCheckbox
}
const teamPlayerValueObject = {
    team: createString50("Query Team Name"),
    player: createString50("Query Player Name")
}
const playerActiveValueObject = {
    player: createString50("Player Name"),
    active: createCheckbox
}

const postHandlers: PostHandlers = {
    player: async ({data: d, query: q}: RoutePostArgsWithType<{player: string, active: string}, {team: string, player: string}>) => {
        let query = await validateObject(q, teamPlayerValueObject)
        let { player: {value: playerName}, active } = await validateObject(d, playerActiveValueObject)
        let [team] = await validate([requiredAsync(`Unknown team "${query.team}"`)(get<Team>(query.team.value))]) 
        let [player] = await validate([
            required(`Unknown player "${query.player}"`)(team.players.find(x => x.name === query.player.value))]) 

        // Check for duplicates
        await assert.isFalse(
            player.name !== playerName && !!team.players.find(x => x.name === playerName),
            `The player name "${playerName}" has already been chosen.`)

        player.name = playerName
        player.active = active
        // Player name will also need to be updated for the individual player when implemented!
        await set(team.name, team)
        return
    },
    team: async({ data, query }: RoutePostArgsWithType<{team: string, year: string, active?: "on"}, {team: string}>) => {
        let { team: {value: newTeamName}, year, active } = await validateObject(data, teamSingleValueObject)
        let { team: { value: queryTeam } } = await validateObject(query, teamStringValueObject)

        let [team, teams] = await validate([
            requiredAsync(`Could not find team "${queryTeam}"!`)(get<Team>(queryTeam)),
            requiredAsync(`Could not find teams!`)(get("teams"))])
        let aggregateTeamIndex = teams?.findIndex(x => x.name === queryTeam)
        await assert.isFalse(aggregateTeamIndex === -1, `Could not find the aggregate team "${queryTeam}"`)
        // Check for duplicates
        await assert.isFalse(
            queryTeam !== newTeamName && !!teams?.find(x => x.name === newTeamName),
            `The team "${newTeamName}" already exists!`)

        let newTeam : Team = {
            name: newTeamName,
            players: team.players
        }

        let newSingleTeam: TeamSingle = {
            active,
            name: newTeamName,
            year: year.value,
        }
        // @ts-ignore
        teams[aggregateTeamIndex] = newSingleTeam
        await Promise.all([set(newTeamName, newTeam), set("teams", teams)])
        return Response.redirect(`/web/players/edit?team=${encodeURIComponent(newTeamName)}`, 302)
    }
}

const route : Route = {
    route: /\/players\/edit\/$/,
    async get(req: Request) {
        const result = await start(req)
        const template = await layout(req)
        return template({
            main: render(result),
            head
        })
    },
    post: handlePost(postHandlers)
}
export default route
