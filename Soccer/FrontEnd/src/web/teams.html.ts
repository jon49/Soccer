import html from "./server/html-template-tag"
import layout from "./_layout.html"
import { CacheTeams, cache, Team, Message, } from "./server/db"
import { handlePost, PostHandlers } from "./server/route"
import { searchParams } from "./server/utils"
import { validateObject } from "./server/validation"
import { messageView, when } from "./server/shared"
import { dataTeamNameYearValidator } from "./server/validators"
import { teamGetAll, teamsCreate, WasFiltered } from "./server/repo-team"
import { reject } from "./server/repo"

interface TeamsView {
    teams: Team[] | undefined
    wasFiltered: boolean
    cache?: CacheTeams
    message: Message
    posted: string | undefined
}

async function start(req: Request) : Promise<TeamsView> {
    const [message, teamsCache, posted] = await Promise.all([
        cache.pop("message"),
        cache.pop("teams"),
        cache.pop("posted")])
    const query = searchParams<{all: string}>(req)
    const showAll = query.all !== null

    let wasFiltered : WasFiltered = {}
    let teams = await teamGetAll(showAll, wasFiltered)
    return { teams, wasFiltered: !!wasFiltered.filtered, cache: teamsCache, message, posted }
}

const render = ({ teams, wasFiltered, cache, message, posted }: TeamsView) => 
    html`
<h2>Teams</h2>

${
    teams ? html`
        <ul class=list>
            ${teams?.map(x => {
                let teamId = x.id
                return html`
                <li>
                    <a href="/web/players?teamId=${x.id}">${x.name} - ${x.year}</a>
                    <a href="/web/games?teamId=${x.id}">Games</a>
                    ${when(
                        x.games
                        .sort((a, b) => a.date.localeCompare(b.date))
                        .find(x => x.date),
                        x => html`<a href="/web/games?teamId=${teamId}&gameId=${x.id}">${x.date}</a>`
                    ) ?? html`<span>&nbsp;</span>`}
                    <a href="/web/players/edit?teamId=${x.id}">Edit</a>
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
        <input id=name name=name type=text value="${cache?.name ?? ""}" $${when(posted || !teams?.length, "autofocus")} required>
    </div>
    <div>
        <label for=year>Year</label>
        <input id=year name=year type=text required value="${cache?.year ?? new Date().getFullYear()}">
    </div>
    <button>Save</button>
</form>`


const postHandlers: PostHandlers = {
    post: async function post({ data }) {
        let d = await validateObject(data, dataTeamNameYearValidator)
        await teamsCreate(d)
        ?.catch(_ => reject({ posted: "add-team", teams: {name: d.name, year: d.year} }))

        await cache.push({posted: "add-team"})

        return
    },
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

