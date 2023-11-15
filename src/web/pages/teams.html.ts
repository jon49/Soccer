import html from "../server/html.js"
import layout from "./_layout.html.js"
import { Team } from "../server/db.js"
import { PostHandlers, Route } from "../server/route.js"
import { searchParams } from "../server/utils.js"
import { validateObject } from "../server/validation.js"
import { when } from "../server/shared.js"
import { dataTeamNameYearValidator } from "../server/validators.js"
import { teamGetAll, teamsCreate, WasFiltered } from "../server/repo-team.js"

interface TeamsView {
    teams: Team[] | undefined
    wasFiltered: boolean
}

async function start(req: Request): Promise<TeamsView> {
    const query = searchParams<{ all: string }>(req)
    const showAll = query.all !== null

    let wasFiltered: WasFiltered = {}
    let teams = await teamGetAll(showAll, wasFiltered)
    return { teams, wasFiltered: !!wasFiltered.filtered }
}

const render = ({ teams, wasFiltered }: TeamsView) =>
    html`
<h2>Teams</h2>

${teams ? html`
        <ul id=teams class=list>
            ${teams?.map(getTeamView)}
        </ul>`
            : html`<p>No teams found. Please add one!</p>`
        }

${wasFiltered ? html`<p><a href="/web/teams?all">Show all teams.</a></p>` : null}

<h3>Add a team</h3>

<form class=form action="/web/teams" method=post hf-target=main>
    <div>
        <label for=name>Team Name</label>
        <input id=name name=name type=text $${when(!teams?.length, "autofocus")} required>
    </div>
    <div>
        <label for=year>Year</label>
        <input id=year name=year type=text required value="${new Date().getFullYear()}">
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
        let currentDate = `${d.getFullYear()}-${("" + (d.getMonth() + 1)).padStart(2, "0")}-${("" + d.getDate()).padStart(2, "0")}`
        let result = team.games
            .sort((a, b) => a.date.localeCompare(b.date))
            .find(x => x.date >= currentDate)
        return result
    })(),
        x => html`<a href="/web/games?teamId=${teamId}&gameId=${x.id}">${x.date}</a>`
    ) ?? html`<span>&nbsp;</span>`}
    </li>`
}

const postHandlers: PostHandlers = {
    post: async function post({ req, data }) {
        let d = await validateObject(data, dataTeamNameYearValidator)
        await teamsCreate(d)
        return render(await start(req))
    },
}

const route: Route = {
    route: /\/teams\/$/,
    async get(req: Request) {
        const result = await start(req)
        return layout(req, {
            main: render(result),
            title: "Teams",
        })
    },
    post: postHandlers,
}

export default route

