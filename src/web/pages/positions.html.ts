import html from "../server/html.js"
import layout from "./_layout.html.js"
import { Position, Team } from "../server/db.js"
import { searchParams } from "../server/utils.js"
import { PostHandlers, Route } from "../server/route.js"
import { teamGet } from "../server/repo-team.js"
import { createIdNumber, createString25, validate, validateObject } from "../server/validation.js"
import { dataPositionValidator, queryTeamIdPositionIdValidator, queryTeamIdValidator } from "../server/validators.js"
import { positionGetAll, positionSaveNew, positionsSave } from "../server/repo-player-game.js"

interface PositionView {
    positions: Position[]
    team: Team
}

async function start(req: Request) : Promise<PositionView> {
    let { teamId } = await validateObject(searchParams(req), queryTeamIdValidator)
    let [positions, team] = await Promise.all([positionGetAll(teamId), teamGet(teamId)])
    return { positions: positions.positions, team }
}

function render({ team, positions }: PositionView) {
    return html`
<h2>${team.name} - Positions</h2>

<form class=form method=post>
    <div id=positions>
    ${positions.map(x => positionView(x, team.id))}
    </div>
    <button>Save</button>
</form>

<h3>Add Position</h3>
<form class=form method=post action="?handler=addPosition&teamId=${team.id}">
    <input type=text name=position placeholder="E.g., Defender L, Defender C, Attacker, etc.">
    <button>Save</button>
</form>

<script>
    document.addEventListener("onchange", e => {
        let target = e.target
        if (target instanceof HTMLInputElement) {
            target.form.submit()
        }
    })
</script>
    `
}

function positionView(position: Position, teamId: number) {
    return html`
    <div id="_${position.id}">
        <button formaction="?handler=deletePosition&positionId=${position.id}&teamId=${teamId}">X</button>
        <input class=inline name="${position.id}" value="${position.name}">
    </div>`
}

const positionValidator = {
    id: createIdNumber("Position ID"),
    name: createString25("Position Name")
}

const postHandlers : PostHandlers = {
    addPosition: async ({ data, query }) => {
        let [{ teamId }, { position }] =
            await validate([
                validateObject(query, queryTeamIdValidator),
                validateObject(data, dataPositionValidator)])
        let newPosition = await positionSaveNew(teamId, position)
        return positionView(newPosition, teamId)
    },
    deletePosition: async ({ query }) => {
        let { positionId, teamId } = await validateObject(query, queryTeamIdPositionIdValidator)
        let o = await positionGetAll(teamId)
        o.positions = o.positions.filter(x => x.id !== positionId)
        await positionsSave(teamId, o)
        return html``
    },
    post: async ({ query, data }) => {
        let { teamId } = await validateObject(query, queryTeamIdValidator)
        let editedPositions : Position[] = await
            validate(
                Object.entries(data)
                .filter(x => x[1])
                .map(x => validateObject({id: +x[0], name: ""+x[1]}, positionValidator)))
        let o = await positionGetAll(teamId)
        o.positions = editedPositions
        await positionsSave(teamId, o)
        return html`${editedPositions.map(x => positionView(x, teamId))}`
    }
}

const route : Route = {
    route: /\/positions\/$/,
    async get(req: Request) {
        const result = await start(req)
        return layout(req, { main: render(result) })
    },
    post: postHandlers,
}

export default route

