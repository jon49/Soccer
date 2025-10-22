import type { Team } from "../server/db.js"
import type { RoutePostHandler, RoutePage, RouteGetHandler } from "@jon49/sw/routes.middleware.js"

const {
    html,
    layout,
    repo: { teamGet, positionGetAll, positionsSave },
    validation: {
        createArrayOf,
        createPositiveWholeNumber,
        createString25,
        maybe,
        required,
        queryTeamIdValidator,
        validateObject,
    },
    views: { teamNav },
    utils: { when },
} = self.sw

interface PositionView {
    positions: string[][]
    grid: number[]
    team: Team
}

async function start(query: any): Promise<PositionView> {
    let { teamId } = await validateObject(query, queryTeamIdValidator)
    let [positions, team] = await Promise.all([positionGetAll(teamId), teamGet(teamId)])
    return { positions: positions.positions, team, grid: positions.grid }
}

function render({ team, positions, grid }: PositionView) {
    return html`
<h2>${team.name} — Formation</h2>

<p>
    <a href="?handler=showTemplates&teamId=${team.id}" target="htmz" role="button">Use a template.</a>
</p>

<h3>Grid</h3>
${addGridView(grid, team.id)}

${when(grid.length, () => html`
<h3>Position Names</h3>

${positionsNameView(positions, team.id)}
`)}`
}

function positionsNameView(positions: string[][], teamId: number) {
    return html`<form
    id=positionsForm
    class=form
    method=post
    action="?teamId=${teamId}&handler=editPositions"
    target=htmz
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
</form>`
}

function addGridView(grid: number[], teamId: number) {
    return html`<form
    id=addGrid
    class=row
    style="--card-width:3.5em;"
    method=post
    action="?handler=addGrid&teamId=${teamId}" onchange="this.requestSubmit()"
    target="htmz" >
    ${grid.map((x, i) => html`<input id="grid${i}" class=inline type=number name="grid[]" value="${x}">`)}
    <input id="grid-1" type=number name="grid[]" ${when(!grid.length, () => "autofocus")}>
</form>`
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

function getNumberOfPlayers(numberOfPlayers: number): PossibleTemplatePlayerCounts {
    if (["4", "7", "9", "11"].includes("" + numberOfPlayers)) {
        // @ts-ignore
        return "" + numberOfPlayers
    }
    return "4"
}

function getCircles({ count, y, total }: { count: number, y: number, total: number }) {
    let x = Math.round(1e4 / (count + 1)) / 100
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
    $${function* rows() {
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
    return html`
<div id=templates class=grid style="--grid-item-width: 250px;">
        ${grid.map((x, i) => html`
    <form method=post action="?handler=createFormation&teamId=${teamId}" target="htmz" class=inline>
    <button class=bg>${getTemplate(x)}</button>
    <input type=hidden name=index value="${i}">
    <input type=hidden name=numberOfPlayers value="${numberOfPlayers}">
    </form>`)}
</div>`
}

async function getPositionTemplates(teamId: number) {
    let { grid } = await positionGetAll(teamId)
    let positionCount = grid.reduce((a, b) => a + b, 0) || 4

    return html`
    <main id=main>
        <a href="/web/positions?teamId=${teamId}&hz" target=htmz>Cancel</a>
        <h2>Formation Templates</h2>

        <form target="htmz" onchange="this.requestSubmit()">
            <fieldset class=fieldset-outline>
                <legend>Number of players</legend>
                <label class="inline p-1">
                    <input type=radio name=numberOfPlayers value=4 ${when(positionCount === 4, "checked")}>
                    &nbsp;4
                </label>
                <label class="inline p-1">
                    <input type=radio name=numberOfPlayers value=7 ${when(positionCount === 7, "checked")}>
                    &nbsp;7
                </label>
                <label class="inline p-1">
                    <input type=radio name=numberOfPlayers value=9 ${when(positionCount === 9, "checked")}>
                    &nbsp;9
                </label>
                <label class="inline p-1">
                    <input type=radio name=numberOfPlayers value=11 ${when(positionCount === 11, "checked")}>
                    &nbsp;11
                </label>
            </fieldset>
            <input type=hidden name=teamId value="${teamId}">
            <input type=hidden name=handler value="getTemplates">
        </form>

        ${getTemplates(teamId, positionCount)}

    </main>`
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

function setPositions(grid: number[]): string[][] {
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
        for (let suffix of positionNameSuffix["" + column]) {
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

const postHandlers: RoutePostHandler = {
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

        return html`${addGridView(grid, teamId)}${positionsNameView(positions, teamId)}`
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
        return { status: 200 }
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

        return html`<main id=main>${render(await start(query))}</main>`
    },
}

const getHandlers: RouteGetHandler = {
    async get({ query }) {
        const result = await start(query)
        if (query.hz === "") {
            return html`<main id=main>${render(result)}</main>`
        }
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

const route: RoutePage = {
    get: getHandlers,
    post: postHandlers,
}

export default route

