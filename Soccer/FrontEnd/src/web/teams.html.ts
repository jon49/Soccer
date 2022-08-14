import html from "./js/html-template-tag"
import layout from "./_layout.html"
import { CacheTeams, get, set, Teams, TeamSingle, TempCache, cache, update } from "./js/db"
import { handlePost, PostHandlers, RoutePostArgs, RoutePostArgsWithType } from "./js/route"
import { searchParams } from "./js/utils"
import teamView from "./players.html"

interface TeamsView {
    teams: Teams | undefined
    wasFiltered: boolean
    cache?: CacheTeams
}

async function start(req: Request) : Promise<TeamsView> {
    const [data, teamsCache] = await Promise.all([get("teams"), cache.pop("teams")])
    const query = searchParams<{all: string}>(req)
    const showAll = query.all !== null
    let teams =
        showAll
            ? data
        : data?.filter(x => x.active)
    teams?.sort((a, b) =>
        a.year !== b.year
            ? b.year.localeCompare(a.year)
        : a.name.localeCompare(b.name)
    )
    return { teams, wasFiltered: !!data && !!teams && data.length !== teams.length, cache: teamsCache }
}

const render = ({ teams, wasFiltered, cache }: TeamsView) => 
    html`
<h2>Teams</h2>

${
    teams ? html`
        <ul class=list>
            ${teams?.map(x => {
                let uriName = encodeURIComponent(x.name)
                return html`<li><a href="/web/players?team=${uriName}">${x.name} - ${x.year}</a> <form method=post action="?handler=archive&team=${uriName}"><button>Archive</button></form>`
            })}
        </ul>
    `
    : html`<p>No teams found. Please add one!</p>`
}

${ wasFiltered ? html`<p><a href="?all">Show all teams.</a></p>` : null }

<h3>Add a team</h3>

<form method=post>
    <div>
        <label for=name>Team Name</label>
        <input id=name name=name type=text value="${cache?.name ?? ""}" $${cache?.posted || !teams ? "autofocus" : null} required>
    </div>
    <div>
        <label for=year>Year</label>
        <input id=year name=year type=text required value="${cache?.year ?? new Date().getFullYear()}">
    </div>
    <button>Save</button>
</form>`

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

async function post({ data }: RoutePostArgsWithType<{name: string, year: string}>) {
    let errors: string[] = []
    if (!data.name) errors.push("Team name required!")
    if (!data.year) errors.push("The year is required!")
    let teams = (await get("teams") ?? [])
    if (data.name && teams.find(x => x.name === data.name)) errors.push("Team name must be unique!")
    if (errors.length) {
        return Promise.reject({message: errors, teams: {name: data.name, year: data.year, posted: true} } as TempCache)
    }

    let team: TeamSingle = { ...data, active: true }
    teams.push(team)
    await Promise.all([set("teams", teams), cache.push({teams: {posted: true}})])

    return
}

async function archive({ req }: RoutePostArgs) {
    let query = searchParams<{team: string}>(req)
    let teams = await get("teams")
    await update("teams", xs => {
        let team = xs?.find(x => x.name === query.team)
        if (team) {
            team.active = false
        }
        return xs
    })
    let team = teams?.find(x => x.name === query.team)
    if (team) {
        team.active = false
    }
}

const postHandlers: PostHandlers = { post, archive }

export default {
    route: /\/teams\/$/,
    async get(req: Request) {
        const [result, template] = await Promise.all([start(req), layout(req)])
        return template({ main: render(result), head })
    },
    async post(args: RoutePostArgs) {
        await handlePost(args, postHandlers)
        return Response.redirect(args.req.referrer, 302)
    }
}

