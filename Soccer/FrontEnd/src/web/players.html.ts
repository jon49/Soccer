import html from "./js/html-template-tag"
import layout from "./_layout.html"
import { cache, get, Team, TeamPlayer, TeamSingle } from "./js/db"
import { cleanHtmlId, searchParams } from "./js/utils"
import { handlePost, PostHandlers, Route, RoutePostArgsWithType } from "./js/route"
import { assert, required, requiredAsync, validateObject } from "./js/validation"
import { findTeamSingle, getURITeamComponent, saveTeam, splitTeamName } from "./js/shared"
import { dataPlayerNameValidator, queryTeamValidator } from "./js/validators"

export interface TeamView {
    name: string
    year: string
    players: TeamPlayer[]
}

interface PlayersView {
    players: TeamView
    teamExists: boolean
    playerCache: { posted?: boolean, name?: string } | undefined
    wasFiltered: boolean
}

async function start(req: Request) : Promise<PlayersView> {
    let query = searchParams<{team: string, all: string | null}>(req)
    let queryTeam = splitTeamName(query.team)
    let [players, playerCache] = await Promise.all([get<Team>(query.team), cache.pop("players")])
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
        playerCache,
        wasFiltered,
    }
}

async function post({ data, query }: RoutePostArgsWithType<{name: string}, {team: string}>) {
    let { team: queryTeam } = await validateObject(query, queryTeamValidator)
    let team = await get<Team>(queryTeam)

    let { name } = await validateObject(data, dataPlayerNameValidator)

    if (!team) {
        let teams = await requiredAsync(get("teams"))
        let team_ = await required(findTeamSingle(teams, splitTeamName(queryTeam)), "Could not find team.")
        team = {
            name: team_.name,
            year: team_.year,
            players: []
        }
    }

    await assert.isFalse(!!team.players.find(x => x.name === name), "Player names must be unique!")
        ?.catch(x => Promise.reject({...x, players: { name, posted: true }}))

    team.players.push({
        active: true,
        name,
    })

    await Promise.all([saveTeam(team), cache.push({players: { posted: true }})])

    return
}

function render(view: PlayersView) {
    return html`
    <h2>Team ${view.players?.name ?? "Unknown"}</h2>
    ${  !view.teamExists
            ? html`<p>Could not find the team "${view.players?.name ?? ""}"!</p>`
        : renderMain(view) }`
}

function renderMain({ players: o, playerCache, wasFiltered }: PlayersView) {
    let { name, posted } = playerCache ?? {}
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

    <form method=post onchange="this.submit()">
        <div>
            <label for=name>Player Name</label>
            <input id=name name=name type=text value="${name}" $${posted || !playersExist ? "autofocus" : null} required>
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

const postHandlers : PostHandlers = {
    post,
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
