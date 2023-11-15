import html, { when } from "../server/html.js"
import layout from "./_layout.html.js"
import { Team } from "../server/db.js"
import { searchParams } from "../server/utils.js"
import { PostHandlers, Route } from "../server/route.js"
import { teamGet } from "../server/repo-team.js"
import { createArrayOf, createPositiveWholeNumber, createString25, maybe, validateObject } from "../server/validation.js"
import { queryTeamIdValidator } from "../server/validators.js"
import { positionGetAll, positionsSave } from "../server/repo-player-game.js"
import { teamNav } from "./_shared-views.js"

interface PositionView {
    positions: string[]
    grid: number[]
    team: Team
}

async function start(req: Request) : Promise<PositionView> {
    let { teamId } = await validateObject(searchParams(req), queryTeamIdValidator)
    let [positions, team] = await Promise.all([positionGetAll(teamId), teamGet(teamId)])
    return { positions: positions.positions, team, grid: positions.grid }
}

function render({ team, positions, grid }: PositionView) {
    return html`
<h2>${team.name} - Positions</h2>

<h3>Grid</h3>
<form
    id=add-grid
    class="form cards"
    style="--card-width:3.5em;"
    method=post
    action="/web/positions?handler=addGrid&teamId=${team.id}" onchange="this.requestSubmit()"
    hf-target="main" >
    ${grid.map((x, i) => html`<input id="grid${i}" class=inline type=number name="grid[]" value="${x}">`)}
    <input id="grid-1" type=number name="grid[]" ${when(!grid.length, () => "autofocus")}>
</form>

${when(!!grid.length, () => html`
<h3>Positions</h3>
<form
    class=form
    method=post
    action="/web/positions?teamId=${team.id}"
    onchange="this.requestSubmit()"
    hf-target="main">
    ${function* positionViews() {
        let count = 0
        for (let width of grid) {
            yield html`<div class=row>`
            let p = positions.slice(count, count + width)
            if (p.length < width) {
                p = p.concat(new Array(width - p.length).fill(""))
            }
            yield p.map(x =>
                html`<input id="position${count++}" name="names[]" value="${x}">`)
            yield html`</div>`
        }
    }}
</form>
`)}
    `
}

const positionValidator = {
    names: createArrayOf(maybe(createString25("Position Name")))
}

const gridValidator = {
    grid: createArrayOf(createPositiveWholeNumber("Grid"))
}

const postHandlers : PostHandlers = {
    addGrid: async ({ req, query, data }) => {
        let { teamId } = await validateObject(query, queryTeamIdValidator)
        let { grid } = await validateObject(data, gridValidator)
        grid = grid.filter(x => x)
        let o = await positionGetAll(teamId)
        await positionsSave(teamId, {
            grid,
            positions: o.positions,
            _rev: o._rev })
        return render(await start(req))
    },
    post: async ({ req, query, data }) => {
        let { teamId } = await validateObject(query, queryTeamIdValidator)
        let { names } = await validateObject(data, positionValidator)
        let o = await positionGetAll(teamId)
        o.positions = names.map(x => x || "")
        await positionsSave(teamId, o)
        return render(await start(req))
    }
}

const route : Route = {
    route: /\/positions\/$/,
    async get(req: Request) {
        const result = await start(req)
        return layout(req, {
            main: render(result),
            nav: teamNav(result.team.id),
            title: `Positions - ${result.team.name} (${result.team.year})`,
        })
    },
    post: postHandlers,
}

export default route

