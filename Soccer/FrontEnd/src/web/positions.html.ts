import html from "./server/html-template-tag"
import layout from "./_layout.html"
import { Position, Team } from "./server/db"
import { equals, getNewId, searchParams } from "./server/utils"
import { handlePost, PostHandlers, Route } from "./server/route"
import { teamGet } from "./server/repo-team"
import { assert, createIdNumber, createString25, validate, validateObject } from "./server/validation"
import { dataPositionValidator, queryTeamIdPositionIdValidator, queryTeamIdValidator } from "./server/validators"
import { positionGetAll, positionSave, positionsSave } from "./server/repo-player-game"
import { reject } from "./server/repo"

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

<form class=form method=post target=#positions>
    <div id=positions>
    ${positions.map(x => positionView(x, team.id))}
    </div>
    <button>Save</button>
</form>

<h3>Add Position</h3>
<form class=form method=post action="?handler=addPosition&teamId=${team.id}" target=#positions hf-swap="append">
    <input type=text name=position placeholder="A a position.">
    <button>Save</button>
</form>

<script>
    document.addEventListener("onchange", e => {
        let target = e.target
        if (target instanceof HTMLInputElement) {
            target.form.requestSubmit()
        }
    })
</script>
    `
}

function positionView(position: Position, teamId: number) {
    return html`
    <div id="_${position.id}">
        <button formaction="?handler=deletePosition&positionId=${position.id}&teamId=${teamId}" target="#_${position.id}">X</button>
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
        let { positions } = await positionGetAll(teamId)
        let positionObj = positions.find(x => equals(x.name, position))
        if (positionObj) {
            return reject(`The position '${positionObj.name}' already exists.`)
        }
        let newPosition : Position = {
            id: getNewId(positions.map(x => x.id)),
            name: position,
        }
        await positionSave(teamId, newPosition)
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
        await assert.isTrue(new Set(editedPositions.map(x => x.name)).size === editedPositions.length, `Position names must be unique!`)
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
        const template = await layout()
        return template({ main: render(result), scripts: ["/web/js/lib/request-submit.js", "/web/js/lib/htmf.js"] })
    },
    post: handlePost(postHandlers),
}
export default route

