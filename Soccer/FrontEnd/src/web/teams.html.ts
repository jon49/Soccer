import html from "./js/html-template-tag"
import layout from "./_layout.html"
import { CacheTeams, get, set, Teams, TeamSingle, TempCache, cache, update } from "./js/db"
import { handlePost, PostHandlers, RoutePostArgsWithType } from "./js/route"
import { searchParams } from "./js/utils"
import { assert, createString25, required, requiredAsync, validateObject } from "./js/validation"

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
                return html`
                <li>
                    <a href="/web/players?team=${uriName}">${x.name} - ${x.year}</a>
                    ${ x.active
                        ? html`<form method=post action="?handler=archive&team=${uriName}"><button>Archive</button></form>`
                    : html`<form method=post action="?handler=activate&team=${uriName}"><button>Activate</button></form>` }
                </li>`
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

const teamValidator = {
    name: createString25("Team Name"),
    year: createString25("Team Year"),
}

async function post({ data: d }: RoutePostArgsWithType<{name: string, year: string}>) {
    let data = await validateObject(d, teamValidator)
    let teams = (await get("teams") ?? [])
    await assert.isFalse(!!teams.find(x => x.name === data.name), "Team name must be unique!")
    ?.catch(x => Promise.reject({ ...x, teams: {name: data.name, year: data.year, posted: true} } as TempCache))

    let team: TeamSingle = { ...data, active: true }
    teams.push(team)
    await Promise.all([set("teams", teams), cache.push({teams: {posted: true}})])

    return
}

function setActiveValueTo(active: boolean) {
    return async ({ query: { team: queryTeam } }: RoutePostArgsWithType<any, {team: string}>) => {
        let teams = await requiredAsync(get("teams"), "Oops! Something happens which shouldn't have.")
        let team = await required(teams.find(x => x.name === queryTeam), `Could not find team "${queryTeam}".`)
        team.active = active
        await set("teams", teams)
    }
}

const postHandlers: PostHandlers = {
    post,
    archive: setActiveValueTo(false),
    activate: setActiveValueTo(true),
}

export default {
    route: /\/teams\/$/,
    async get(req: Request) {
        const [result, template] = await Promise.all([start(req), layout(req)])
        return template({ main: render(result), head })
    },
    post: handlePost(postHandlers),
}

