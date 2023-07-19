import html from "./server/html-template-tag"
import layout from "./_layout.html"
import { CacheTeams, cache, Message, Team, } from "./server/db"
import { PostHandlers } from "./server/route"
import { searchParams } from "./server/utils"
import { validateObject } from "./server/validation"
import { messageView, when } from "./server/shared"
import { dataTeamNameYearValidator } from "./server/validators"
import { teamGet, teamGetAll, teamsCreate, WasFiltered } from "./server/repo-team"
import { reject } from "./server/repo"

interface TeamsView {
    teams: Team[] | undefined
    wasFiltered: boolean
    cache?: CacheTeams
    message: Message
}

async function start(req: Request) : Promise<TeamsView> {
    const [message, teamsCache ] = await Promise.all([
        cache.pop("message"),
        cache.pop("teams") ])
    const query = searchParams<{all: string}>(req)
    const showAll = query.all !== null

    let wasFiltered : WasFiltered = {}
    let teams = await teamGetAll(showAll, wasFiltered)
    return { teams, wasFiltered: !!wasFiltered.filtered, cache: teamsCache, message }
}

const render = ({ teams, wasFiltered, cache, message }: TeamsView) => 
    html`
<h2>Teams</h2>

${
    teams ? html`
        <ul id=teams class=list>
            ${teams?.map(getTeamView)}
        </ul>`
    : html`<p>No teams found. Please add one!</p>`
}

${ wasFiltered ? html`<p><a href="?all">Show all teams.</a></p>` : null }

<h3>Add a team</h3>

${messageView(message)}

<form class=form method=post target=#teams hf-swap=append>
    <div>
        <label for=name>Team Name</label>
        <input id=name name=name type=text value="${cache?.name ?? ""}" $${when(!teams?.length, "autofocus")} required>
    </div>
    <div>
        <label for=year>Year</label>
        <input id=year name=year type=text required value="${cache?.year ?? new Date().getFullYear()}">
    </div>
    <button>Save</button>
</form>`

function getTeamView(team: Team) {
    let teamId = team.id
    return html`
    <li>
        <a href="/web/players?teamId=${team.id}">${team.name} - ${team.year}</a>
        <a href="/web/games?teamId=${team.id}">Games</a>
        ${when((() => {
            let d = new Date()
            let currentDate = `${d.getFullYear()}-${(""+(d.getMonth() + 1)).padStart(2, "0")}-${(""+d.getDate()).padStart(2, "0")}`
            let result = team.games
            .sort((a, b) => a.date.localeCompare(b.date))
            .find(x => x.date >= currentDate)
            return result
        })(),
            x => html`<a href="/web/games?teamId=${teamId}&gameId=${x.id}">${x.date}</a>`
        ) ?? html`<span>&nbsp;</span>`}
        <a href="/web/players/edit?teamId=${teamId}">Edit</a>
    </li>`
}

const postHandlers: PostHandlers = {
    post: async function post({ data }) {
        let d = await validateObject(data, dataTeamNameYearValidator)
        let teamId = await teamsCreate(d)
        ?.catch(_ => reject({ teams: {name: d.name, year: d.year} }))

        let team = await teamGet(teamId)
        return getTeamView(team)
    },
}

export default {
    route: /\/teams\/$/,
    async get(req: Request) {
        const result = await start(req)
        const template = await layout(req)
        return template({ main: render(result) })
    },
    post: postHandlers,
}

