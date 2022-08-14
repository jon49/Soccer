import html from "./js/html-template-tag"
import layout from "./_layout.html"
import { get, Team, TeamPlayer, TeamSingle } from "./js/db"
import { searchParams } from "./js/utils"
import { Route } from "./js/route"

export interface TeamView {
    name?: string
    players?: TeamPlayer[]
}

interface PlayersView {
    players: TeamView | undefined
    teamExists: boolean
}

async function start(req: Request) {
    let query = searchParams<{team: string}>(req)
    let players = await get<Team>(query.team)
    let team : TeamSingle | undefined
    if (!players) {
        let teams = await get("teams")
        team = teams?.find(x => x.name === query.team)
    }
    let teamExists = !!(players || team)
    let result: PlayersView = {
        players: teamExists && players || { name: team?.name },
        teamExists,
    }
    return result
}

function render({ players, teamExists }: PlayersView) {
    return html`
    <h2>Team ${players?.name ?? "Unknown"}</h2>
    ${  !teamExists
            ? html`<p>Could not find the team "${players?.name ?? ""}"!</p>`
        : renderMain({players, teamExists}) }`
}

function renderMain({ players }: PlayersView) {
    return html`
    ${ players && players.players
        ? html`
    <ul class=list>
        ${players.players?.map(x => {
            let uriName = encodeURIComponent(x.name);
            return html`<li><a href="?player=${uriName}">${x.name}</a> <a href="edit?player=${uriName}">Edit</a></li>`
        })}
    </ul>`
       : html`<p>No players found. Please add one!</p>` }
    <h3>Add a player</h3>

    <form method=post onchange="this.submit()">
        <div>
            <label for=name>Player Name</label>
            <input id=name name=name type=text $${!players?.players ? "autofocus" : null} required>
        </div>
        <button>Save</button>
    </form>`
}

const head = `
    <style>
        .list {
            list-style-type: none;
            display: table;
        }
        .list > li {
            display: table-row;
        }
        .list > li > * {
            display: table-cell;
            padding: 1px 5px;
        }
    </style>`

const route : Route = {
    route: /\/players\/$/,
    async get(req: Request) {
        const [result, template] = await Promise.all([start(req), layout(req)])
        return template({ main: render(result), head, nav: [{name: "Edit", url: `edit?team=${result.players?.name}`}] })
    }
}
export default route
