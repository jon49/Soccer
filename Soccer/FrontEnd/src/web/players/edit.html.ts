import { cache, get, set, Team, TeamPlayer } from "../js/db"
import html from "../js/html-template-tag"
import { handlePost1, Route, RoutePostArgsWithType } from "../js/route"
import { searchParams } from "../js/utils"
import layout from "../_layout.html"

export interface TeamView {
    name?: string
    players: TeamPlayer[]
}

interface PlayersEditView {
    team: TeamView
}

async function start(req: Request) : Promise<PlayersEditView | undefined> {
    let query = searchParams<{team: string | null}>(req)
    let teamName = query.team?.trim()
    if (!teamName) {
        await cache.push({message: "Team name is required!"})
        return
    }
    let team = await get<Team>(teamName)
    if (!team) {
        await cache.push({message: "Players must be added to the team before editing a team!"})
        return
    }

    return {
        team,
    }
}

function render(o: PlayersEditView | undefined) {
    if (!o?.team) {
        return html``
    }

    let { team } = o
    let teamUriName = encodeURIComponent(team.name ?? "")

    return html`
<h2>Team ${ o?.team.name ??  "Unknown"}</h2>
<form class=form method=post action="?handler=teamName&team=${teamUriName}">
    <div>
        <label for=team>Team Name: </label><input id=team name=team type=text value="${team.name}">
    </div>
    <button>Save</button>
</form>
${team.players.map(x => {
    return html`
    <form method=post class=form action="?handler=player&team=${teamUriName}&player=${x.name}">
        <div>
            <label for=player>Name:</label>
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

const postHandlers = {
    player: async ({data, query}: RoutePostArgsWithType<{player: string, active: string}, {team: string, player: string}>) => {
        let errors: string[] = []
        let playerName = data.player?.trim()
        if (!playerName) errors.push("Player name is required.")
        if (errors.length > 0) return Promise.reject({message: errors})
        let team = await get<Team>(query.team)
        if (!team) return Promise.reject({message: `Unknown team "${query.team}"`})
        let player = team.players.find(x => x.name === query.player)
        if (!player) return Promise.reject({message: `Unknown player "${query.player}"`})
        if (player.name !== playerName) {
            let duplicatePlayerName = team.players.find(x => x.name === playerName)
            if (duplicatePlayerName) return Promise.reject({message: `The player name "${playerName}" has already been chosen.`})
        }

        player.name = playerName
        player.active = data.active === "on"
        // Player name will also need to be updated for the individual play.
        await set(team.name, team)
        return
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
    post: handlePost1(postHandlers)
}
export default route
