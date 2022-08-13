import html from "./js/html-template-tag"
import layout from "./_layout.html"
import { get, set, Teams, TeamSingle } from "./js/db"
import { RoutePostArgs } from "./js/route"

async function start(req: Request) {
    const data = await get("teams")
    const url = new URL(req.url)
    let teams =
        url.searchParams.get("all")
            ? data
        : data?.filter(x => x.active)
    teams?.sort((a, b) =>
        a.year !== b.year
            ? b.year.localeCompare(a.year)
        : a.name.localeCompare(b.name)
    )
    return teams
}

const render = (teams: Teams | undefined) => 
    html`
<h2>Teams</h2>

${
    teams ? html`
        <ul class=list>
            ${teams?.map(x => html`<li><a href="?team=${x.name}">${x.name} - ${x.year}</a> <a href="/web/teams/edit?team=${x.name}">Edit</a></li>`)}
        </ul>
    `
    : html`<p>No teams found. Please add one!</p>`
}

<p><strong>Add a team:</strong></p>

<form method=post>
    <div>
        <label for=name>Team Name</label><input id=name name=name type=text required>
    </div>
    <div>
        <label for=year>Year</label><input id=year name=year type=text required value="$${new Date().getFullYear()}">
    </div>
    <button>Save</button>
</form>`

const head = `
    <style>
        ul.list {
            list-style-type: none;
            display: table;
        }
        ul.list > li {
            display: table-row;
        }
        ul.list > li > a {
            display: table-cell;
            padding: 1px 5px;
        }
    </style>`

async function post(data: {name: string, year: string}) {
    let errors: string[] = []
    if (!data.name) errors.push("Team name required!")
    if (!data.year) errors.push("The year is required!")
    let teams = (await get("teams") ?? [])
    if (data.name && teams.find(x => x.name === data.name)) errors.push("Team name must be unique!")
    if (errors.length) {
        return Promise.reject({message: errors})
    }

    let team: TeamSingle = { ...data, active: true }
    teams.push(team)
    await set("teams", teams)

    return
}

export default {
    route: /\/teams\/$/,
    async get(req: Request) {
        const [result, template] = await Promise.all([start(req), layout(req)])
        return template({ main: render(result), head })
    },
    async post({ data, req }: RoutePostArgs) {
        await post(data)
        return Response.redirect(req.referrer, 302)
    }
}

