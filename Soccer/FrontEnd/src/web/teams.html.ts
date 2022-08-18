import html from "./js/html-template-tag"
import layout from "./_layout.html"
import { CacheTeams, get, set, TeamSingle, TempCache, cache, Team, Message, } from "./js/db"
import { handlePost, PostHandlers, RoutePostArgsWithType } from "./js/route"
import { searchParams } from "./js/utils"
import { assert, validateObject } from "./js/validation"
import { getOrCreateTeamMany, getURITeamComponent, messageView, whenF } from "./js/shared"
import { dataTeamNameYearValidator } from "./js/validators"

interface TeamsView {
    teams: Team[] | undefined
    wasFiltered: boolean
    cache?: CacheTeams
    message: Message
}

async function start(req: Request) : Promise<TeamsView> {
    const [message, data, teamsCache] = await Promise.all([cache.pop("message"), get("teams"), cache.pop("teams")])
    const query = searchParams<{all: string}>(req)
    const showAll = query.all !== null
    let teams =
        showAll
            ? data
        : data?.filter(x => x.active)
    teams?.sort((a, b) =>
        a.year !== b.year
            ? b.year.localeCompare(a.year)
        : a.name.localeCompare(b.name))
    let teamFull = await getOrCreateTeamMany(teams)
    return { teams: teamFull, wasFiltered: !!data && !!teams && data.length !== teams.length, cache: teamsCache, message }
}

const render = ({ teams, wasFiltered, cache, message }: TeamsView) => 
    html`
<h2>Teams</h2>

${
    teams ? html`
        <ul class=list>
            ${teams?.map(x => {
                let uriName = getURITeamComponent(x)
                return html`
                <li>
                    <a href="/web/players?team=${uriName}">${x.name} - ${x.year}</a>
                    <a href="/web/games?team=${uriName}">Games</a>
                    ${whenF(
                        x.games
                        .sort((a, b) => a.date.localeCompare(b.date))
                        .find(x => x.date),
                        x => html`<a href="/web/games?team=${uriName}&game=${x.id}">${x.date}</a>`
                    ) ?? html`<span>&nbsp;</span>`}
                    <a href="/web/players/edit?team=${uriName}">Edit</a>
                </li>`
            })}
        </ul>`
    : html`<p>No teams found. Please add one!</p>`
}

${ wasFiltered ? html`<p><a href="?all">Show all teams.</a></p>` : null }

<h3>Add a team</h3>

${messageView(message)}

<form class=form method=post>
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

async function post({ data: d }: RoutePostArgsWithType<{name: string, year: string}>) {
    let data = await validateObject(d, dataTeamNameYearValidator)
    let teams = (await get("teams") ?? [])
    await assert.isFalse(!!teams.find(x => x.name === data.name), "Team name must be unique!")
    ?.catch(x => Promise.reject({ ...x, teams: {name: data.name, year: data.year, posted: true} } as TempCache))

    let team: TeamSingle = { ...data, active: true }
    teams.push(team)
    await Promise.all([set("teams", teams), cache.push({teams: {posted: true}})])

    return
}

const postHandlers: PostHandlers = {
    post,
}

export default {
    route: /\/teams\/$/,
    async get(req: Request) {
        const result = await start(req)
        const template = await layout(req)
        return template({ main: render(result) })
    },
    post: handlePost(postHandlers),
}

