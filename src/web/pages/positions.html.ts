import html, { when } from "../server/html.js"
import layout from "./_layout.html.js"
import { Team } from "../server/db.js"
import { PostHandlers, Route, RouteGetHandler } from "@jon49/sw/routes"
import { teamGet } from "../server/repo-team.js"
import { createArrayOf, createPositiveWholeNumber, createString25, maybe, required } from "../server/validation.js"
import { queryTeamIdValidator } from "../server/validators.js"
import { positionGetAll, positionsSave } from "../server/repo-player-game.js"
import { teamNav } from "./_shared-views.js"
import { validateObject } from "promise-validation"

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
<h2>${team.name} - Formation</h2>

<p>Use a <button form=show-templates-form>template</button>.</p>

<form
    id=show-templates-form
    action="/web/positions?handler=showTemplates&teamId=${team.id}"
    hf-target="#dialogs"
    hidden>
</form>
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
<h3>Position Names</h3>
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

const templates = {
    "4": [
        [1, 2, 1],
        [1, 1, 2],
    ],
    "7": [
        [1, 3, 2, 1],
        [1, 2, 3, 1],
        [2, 2, 2, 1],
    ],
    "9": [
        [2, 3, 3, 1],
        [3, 3, 2, 1],
        [2, 4, 2, 1],
        [3, 2, 3, 1],
    ],
    "11": [
        [2, 4, 4, 1],
        [3, 3, 4, 1],
        [2, 5, 3, 1],
        [1, 3, 2, 4, 1],
        [3, 4, 3, 1],
    ],
}

type PossibleTemplatePlayerCounts = keyof typeof templates

function getNumberOfPlayers(numberOfPlayers: number) : PossibleTemplatePlayerCounts {
    if (["4", "7", "9", "11"].includes(""+numberOfPlayers)) {
        // @ts-ignore
        return ""+numberOfPlayers
    }
    return "4"
}

function getCircles({ count, y, total }: { count: number, y: number, total: number }) {
    let x = Math.round(1e4/(count + 1))/100
    let cy = 90 * (y / total)
    let circles = ""
    for (let i = 0; i < count; i++) {
        circles += `<circle cx="${x * (i + 1)}%" cy="${cy}%" r="3%" fill="#fd6b00" />`
    }
    return circles
}

function getTemplate(positions: number[]) {
    let formationName =
        positions.length === 3
            ? [...positions].reverse().join("-")
        : [...positions].reverse().slice(1).join(" - ")
    return html`
<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
    <text x="1%" y="10%" fill="#fd6b00" font-weight="bold" font-size="20">$${formationName}</text>
    $${
    function* rows() {
        let total = positions.length
        let y = 1
        for (let count of positions) {
            yield getCircles({ count, y, total })
            y++
        }
    }
}
</svg>
`
}

function getTemplates(teamId: number, numberOfPlayers: number) {
    let playerCount = getNumberOfPlayers(numberOfPlayers)
    let grid = templates[playerCount]
    return grid.map((x, i) => html`
<form
    method=post
    class=inline
    action="/web/positions?teamId=${teamId}&handler=createFormation"
    hf-target="main"
    >
<button class=bg>${getTemplate(x)}</button>
<input type=hidden name=index value="${i}">
<input type=hidden name=numberOfPlayers value="${numberOfPlayers}">
</form>`
    )
}

async function getPositionTemplates(teamId: number) {
    let { grid } = await positionGetAll(teamId)
    let positionCount = grid.reduce((a, b) => a + b, 0)

    return html`
    <dialog class=modal is=x-dialog show-modal close-event="user-messages">
    <h2 class=inline>Formation Templates</h2> 
    <form class=inline method=dialog>
        <button value=cancel>Cancel</button>
    </form>

    <form
        action="/web/positions?handler=getTemplates&teamId=${teamId}"
        onchange="this.requestSubmit()"

        is=form-subscribe
        data-onload

        hf-target="#templates"
        >
        Number of players: <select class=inline name=numberOfPlayers>
            <option value=4 ${when(positionCount === 4, "selected")}>4</option>
            <option value=7 ${when(positionCount === 7, "selected")}>7</option>
            <option value=9 ${when(positionCount === 9, "selected")}>9</option>
            <option value=11 ${when(positionCount === 11, "selected")}>11</option>
        </select>
    </form>
    <div id=templates class=rows></div>
    </dialog>`
}

const positionNames = [
    "Striker",
    "Forward",
    "Midfield",
    "Fullback",
    "Goalkeeper",
]

const positionNameSuffix = {
    "5": ["L", "LC", "C", "RC", "R"],
    "4": ["L", "LC", "RC", "R"],
    "3": ["L", "C", "R"],
    "2": ["L", "R"],
    "1": [""],
}

function setPositions(grid: number[]) : string[][] {
    let names = [...positionNames]
    if (grid.length === 4) {
        names.splice(0, 1)
    } else if (grid.length === 3) {
        names.splice(0, 1).splice(3, 1)
    }
    let positions = []
    for (let i = 0; i < grid.length; i++) {
        let column = grid[i]
        let name = names[i]
        let row = []
        // @ts-ignore
        for (let suffix of positionNameSuffix[""+column]) {
            row.push(`${name} ${suffix}`)
        }
        positions.push(row)
    }

    return positions
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
    },

    async createFormation({ query, data }) {
        let { teamId } = await validateObject(query, queryTeamIdValidator)
        let { index, numberOfPlayers } = await validateObject(data, {
            index: createPositiveWholeNumber("Index"),
            numberOfPlayers: createPositiveWholeNumber("Number of Players"),
        })

        let o = await positionGetAll(teamId)
        let playerCount = getNumberOfPlayers(numberOfPlayers)
        let grid = await required(templates[playerCount][index], "Template not found!")
        let positions = setPositions(grid)

        await positionsSave(teamId, {
            ...o,
            grid,
            positions,
        })

        return render(await start(query))
    },
}

const getHandlers : RouteGetHandler = {
    async get({ query }) {
        const result = await start(query)
        return layout({
            main: render(result),
            nav: teamNav(result.team.id),
            title: `Formation - ${result.team.name} (${result.team.year})`,
        })
    },

    async showTemplates({ query }) {
        let { teamId } = await validateObject(query, queryTeamIdValidator)
        return getPositionTemplates(teamId)
    },

    async getTemplates({ query }) {
        let { teamId, numberOfPlayers } = await validateObject(query, {
            ...queryTeamIdValidator,
            numberOfPlayers: createPositiveWholeNumber("Number of Players"),
        })

        return html`${getTemplates(teamId, numberOfPlayers)}`
    }
}

const route : Route = {
    route: /\/positions\/$/,
    get: getHandlers,
    post: postHandlers,
}

export default route

