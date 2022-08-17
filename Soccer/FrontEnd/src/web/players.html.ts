import html from "./js/html-template-tag"
import layout from "./_layout.html"
import { cache, get, Team, TeamPlayer, TeamSingle } from "./js/db"
import { cleanHtmlId, searchParams } from "./js/utils"
import { handlePost, PostHandlers, Route } from "./js/route"
import { findTeamSingle, getURITeamComponent, splitTeamName } from "./js/shared"
import { addPlayer, addPlayerForm } from "./js/_AddPayer.html"

export interface TeamView {
    name: string
    year: string
    players: TeamPlayer[]
}

interface PlayersView {
    players: TeamView
    teamExists: boolean
    name?: string
    posted?: string
    wasFiltered: boolean
}

async function start(req: Request) : Promise<PlayersView> {
    let query = searchParams<{team: string, all: string | null}>(req)
    let queryTeam = splitTeamName(query.team)
    let [players, cached, posted] = await Promise.all([get<Team>(query.team), cache.pop("players"), cache.pop("posted")])
    let team : TeamSingle | undefined
    let wasFiltered = false
    if (!players) {
        let teams = await get("teams")
        if (teams) {
            team = findTeamSingle(teams, queryTeam)
        }
    } else if (query.all === null) {
        let filtered = players.players.filter(x => x.active)
        wasFiltered = filtered.length !== players.players.length
        players.players = filtered
    }
    let teamExists = !!(players || team)
    return {
        players: teamExists && players || { name: queryTeam.name, year: queryTeam.year, players: [] },
        teamExists,
        name: cached?.name,
        posted,
        wasFiltered,
    }
}

function render(view: PlayersView) {
    return html`
    <h2>Team ${view.players?.name ?? "Unknown"}</h2>
    ${  !view.teamExists
            ? html`<p>Could not find the team "${view.players?.name ?? ""}"!</p>`
        : renderMain(view) }`
}

function renderMain({ players: o, name, posted, wasFiltered }: PlayersView) {
    let teamUriName = getURITeamComponent(o)
    let playersExist = o.players.length > 0
    return html`
    ${ playersExist
        ? html`
    <ul class=list>
        ${o.players.map(x => {
            let uriName = encodeURIComponent(x.name);
            return html`
            <li>
                <a href="?player=${uriName}&team=${teamUriName}">${x.name}</a>
                <a href="/web/players/edit?team=${teamUriName}#${cleanHtmlId(x.name)}">Edit</a>
            </li>`
        })}
    </ul>`
       : html`<p>No players found. Please add one!</p>` }

    ${ wasFiltered
        ? html`<p><a href="?all&team=${teamUriName}">Show all players.</a></p>`
    : playersExist && o.players.find(x => !x.active)
        ? html`<p><a href="?team=${teamUriName}">Hide archived players.</a></p>`
    : null }

    <h3>Add a player</h3>

    ${addPlayerForm({name, posted, playersExist, message: void 0})}
    `
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

const postHandlers : PostHandlers = {
    post: addPlayer,
}

const route : Route = {
    route: /\/players\/$/,
    async get(req: Request) {
        const [result, template] = await Promise.all([start(req), layout(req)])
        return template({
            main: render(result),
            head,
            nav: [{name: "Edit", url: `/web/players/edit?team=${getURITeamComponent(result.players)}#team`}] })
    },
    post: handlePost(postHandlers),
}
export default route
