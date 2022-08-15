import html from "./js/html-template-tag"
import layout from "./_layout.html"
import { cache, get, set, Team, TeamPlayer, TeamSingle } from "./js/db"
import { searchParams } from "./js/utils"
import { handlePost, PostHandlers, Route, RoutePostArgs, RoutePostArgsWithType } from "./js/route"

export interface TeamView {
    name?: string
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
    let [players, playerCache] = await Promise.all([get<Team>(query.team), cache.pop("players")])
    let team : TeamSingle | undefined
    let wasFiltered = false
    if (!players) {
        let teams = await get("teams")
        team = teams?.find(x => x.name === query.team)
    } else if (query.all === null) {
        let filtered = players.players.filter(x => x.active)
        wasFiltered = filtered.length !== players.players.length
        players.players = filtered
    }
    let teamExists = !!(players || team)
    return {
        players: teamExists && players || { name: team?.name, players: [] },
        teamExists,
        playerCache,
        wasFiltered,
    }
}

async function post({ data, req }: RoutePostArgsWithType<{name: string}>) {
    let query = searchParams<{team: string}>(req)
    let team = await get<Team>(query.team)

    let errors: string[] = []
    let name = data.name?.trim()
    if (!name) errors.push("Player name required!")
    if (errors.length > 0) {
        return Promise.reject({message: errors})
    }

    if (!team) {
        let teams = await get("teams")
        let team_ = teams?.find(x => query.team === x.name)
        if (!team_) return Promise.reject({message: ["Could not find team."]})
        team = {
            name: team_.name,
            players: []
        }
    }

    let player = team.players.find(x => x.name === name)
    if (player) {
        await cache.push({players: { name, posted: true }})
        return Promise.reject({message: ["Player names must be unique!"]})
    }

    team.players.push({
        active: true,
        name,
    })

    await Promise.all([set(team.name, team), cache.push({players: { posted: true }})])

    return
}

function setActiveValueTo(active: boolean) {
    return async ({ req }: RoutePostArgs) => {
        let query = searchParams<{team: string, player: string}>(req)

        let errors: string[] = []
        let name = query.player?.trim()
        if (!name) errors.push(`Player name is required.`)
        let teamName = query.team?.trim()
        if (!teamName) errors.push(`Team name is required.`)
        if (errors.length > 0) return Promise.reject({message: errors})

        let team = await get<Team>(teamName)
        if (!team) return Promise.reject({message: [`Could not find team "${query.team}".`]})
        let player = team.players.find(x => x.name === query.player)
        if (!player) return Promise.reject({message: [`Could not find player "${query.player}".`]})
        player.active = active

        await set<Team>(team.name, team)
        return
    }
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
    let teamUriName = encodeURIComponent(o.name ?? "")
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
                ${ x.active
                    ? html`<form method=post action="?handler=archive&player=${uriName}&team=${teamUriName}"><button>Archive</button></form>`
                : html`<form method=post action="?handler=activate&player=${uriName}&team=${teamUriName}"><button>Activate</button></form>` }
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
    archive: setActiveValueTo(false),
    activate: setActiveValueTo(true),
}

const route : Route = {
    route: /\/players\/$/,
    async get(req: Request) {
        const [result, template] = await Promise.all([start(req), layout(req)])
        return template({
            main: render(result),
            head,
            nav: [{name: "Settings", url: `/web/players/edit?team=${encodeURIComponent(result.players.name ?? "")}`}] })
    },
    async post(args: RoutePostArgs) {
        await handlePost(args, postHandlers)
        return Response.redirect(args.req.referrer, 302)
    }
}
export default route
