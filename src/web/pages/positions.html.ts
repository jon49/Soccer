import html, { when } from "../server/html.js"
import layout from "./_layout.html.js"
import { Team } from "../server/db.js"
import { PostHandlers, Route } from "../server/route.js"
import { teamGet } from "../server/repo-team.js"
import { createArrayOf, createPositiveWholeNumber, createString25, maybe, validateObject } from "../server/validation.js"
import { queryTeamIdValidator } from "../server/validators.js"
import { positionGetAll, positionsSave } from "../server/repo-player-game.js"
import { teamNav } from "./_shared-views.js"

interface PositionView {
    positions: string[][]
    grid: number[]
    team: Team
}

async function start(query: any) : Promise<PositionView> {
    let { teamId } = await validateObject(query, queryTeamIdValidator)
    let [positions, team] = await Promise.all([positionGetAll(teamId), teamGet(teamId)])
    return { positions: positions.positions, team, grid: positions.grid }
}

function render({ team, positions, grid }: PositionView) {
    return html`
<h2>${team.name} - Positions</h2>

<h3>Grid</h3>
<form
    id=add-grid
    class=row
    style="--card-width:3.5em;"
    method=post
    action="/web/positions?handler=addGrid&teamId=${team.id}" onchange="this.requestSubmit()"
    hf-target="main" >
    ${grid.map((x, i) => html`<input id="grid${i}" class=inline type=number name="grid[]" value="${x}">`)}
    <input id="grid-1" type=number name="grid[]" ${when(!grid.length, () => "autofocus")}>
</form>

${when(grid.length, () => html`
<h3>Positions</h3>
<form
    id=positions-form
    class=form
    method=post
    action="/web/positions?teamId=${team.id}&handler=editPositions"
    onchange="this.requestSubmit()">
    ${function* positionViews() {
        let count = 0
        for (let xs of positions) {
            yield html`<div class=row>`
            yield xs.map(x =>
                html`<input id="position${count++}" name="names[]" value="${x}">`)
            yield html`</div>`
        }
    }}
</form>
`)}`
}

const positionValidator = {
    names: createArrayOf(maybe(createString25("Position Name"))),
}

const gridValidator = {
    grid: createArrayOf(createPositiveWholeNumber("Grid"))
}

const postHandlers : PostHandlers = {
    async addGrid({ query, data }) {
        let { teamId } = await validateObject(query, queryTeamIdValidator)
        let { grid } = await validateObject(data, gridValidator)

        grid = grid.filter(x => x)

        let o = await positionGetAll(teamId)

        let positions = o.positions
        positions.length = grid.length
        for (let i = 0; i < grid.length; i++) {
            let count = grid[i]
            let xs = positions[i]
            if (xs) {
                xs.length = count
                for (let j = 0; j < count; j++) {
                    xs[j] ??= ""
                }
            } else {
                positions[i] = new Array(count).fill("")
            }
        }

        await positionsSave(teamId, {
            ...o,
            grid,
            positions,
        })
        return render(await start(query))
    },

    async editPositions({ query, data }) {
        let { teamId } = await validateObject(query, queryTeamIdValidator)
        let { names } = await validateObject(data, positionValidator)
        let o = await positionGetAll(teamId)
        let positions: string[][] = []
        for (let grid of o.grid) {
            positions.push(names.splice(0, grid).map(x => x || ""))
        }
        o.positions = positions
        await positionsSave(teamId, o)
        return { body: null, status: 204 }
    }
}

const route : Route = {
    route: /\/positions\/$/,
    async get({ query }) {
        const result = await start(query)
        return layout({
            main: render(result),
            nav: teamNav(result.team.id),
            title: `Positions - ${result.team.name} (${result.team.year})`,
        })
    },
    post: postHandlers,
}

export default route

