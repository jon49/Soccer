import { cache, get, Team, TeamPlayer } from "../js/db"
import html from "../js/html-template-tag"
import { Route } from "../js/route"
import { searchParams } from "../js/utils"
import layout from "../_layout.html"

export interface TeamView {
    name?: string
    players: TeamPlayer[]
}

interface PlayersEditView {
    team: TeamView
}

async function start(req: Request) : Promise<PlayersEditView | undefined> {
    let query = searchParams<{team: string | null}>(req)
    let teamName = query.team?.trim()
    if (!teamName) {
        await cache.push({message: "Team name is required!"})
        return
    }
    let team = await get<Team>(teamName)
    if (!team) {
        await cache.push({message: "Players must be added to the team before editing a team!"})
        return
    }

    return {
        team,
    }
}

function render(o: PlayersEditView | undefined) {
    if (!o?.team) {
        return html``
    }

    let { team } = o
    let teamUriName = encodeURIComponent(team.name ?? "")

    return html`
<h2>Team ${ o?.team.name ??  "Unknown"}</h2>
<form class=form method=post action="?handler=teamName&team=${teamUriName}">
    <div>
        <label for=team>Team Name: </label><input id=team name=team type=text value="${team.name}">
    </div>
    <button>Save</button>
</form>
${team.players.map((x, index) => {
    return html`
    <form method=post class=form action="?handler=player&team=${teamUriName}&index=${index}">
        <div>
            <label for=player>Name:</label>
            <input id=player name=player type=text value="${x.name}">
        </div>
        <div>
            <label for=active>Active</label>
            <input id=active class=inline name=active type=checkbox $${x.active ? "checked" : null}>
        </div>
        <button>Save</button>
    </form>
`})}
    `
}

const head = `
<style>
    .form {
        border: 1px solid black;
        margin: 5px 0;
        padding: 1em;
    }
</style>
`

const route : Route = {
    route: /\/players\/edit\/$/,
    async get(req: Request) {
        const result = await start(req)
        const template = await layout(req)
        return template({
            main: render(result),
            head
        })
    },
}
export default route
