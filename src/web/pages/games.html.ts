import { Game, Team } from "../server/db.js"
import html from "../server/html.js"
import { reject } from "../server/repo.js"
import { teamGet, teamSave } from "../server/repo-team.js"
import { PostHandlers, Route } from "../server/route.js"
import { when } from "../server/shared.js"
import { getNewId, searchParams, tail } from "../server/utils.js"
import { assert, createIdNumber, createString25, maybe, required, validate, validateObject } from "../server/validation.js"
import { queryTeamIdValidator } from "../server/validators.js"
import layout from "./_layout.html.js"

interface GameView {
    team: Team
}

async function start(req: Request): Promise<GameView> {
    let { teamId } = await validateObject(searchParams(req), queryTeamIdValidator)
    let team = await teamGet(teamId)
    return {team}
}

function render({ team }: GameView) {
    return html`
<h2>${team.name} - Games</h2>

<ul id=games class=list>
    ${team.games.map(x => getGameView(team.id, x))}
</ul>

<form class=form method=post>
    <div class=inline>
        <label for=game-date>Name</label>
        <input id=game-date type=date name=date required value=${new Date().toISOString().slice(0, 10)} ${when(team.games.length === 0, "autofocus")}>
    </div>
    <div class=inline>
        <label for=game-opponent>Opponent</label>
        <input id=game-opponent type=text name=opponent>
    </div>
    <div>
        <button>Save</button>
    </div>
</form>
`
}

function getGameView(teamId: number, game: Game) {
    return html`<li id=game-${game.id}>${getGamePartialView(teamId, game)}</li>`
}

function getGamePartialView(teamId: number, game: Game) {
    let teamQuery = `teamId=${teamId}`
    return html`
<form method=post action="?${teamQuery}&handler=edit">
    <input type=hidden name=gameId value="${game.id}">
    <div class=inline>
        <input
            id=game-date
            class=editable
            type=date
            name=date
            required
            value="${game.date}">
        <label for=game-date>
            <a href="?$${teamQuery}&gameId=${game.id}">${game.date}</a>
            <span class=editable-pencil>&#9998;</span>
        </label>
    </div>
    <div class=inline>
        <input
            id=game-opponent
            class=editable
            type=text
            name=opponent
            value="${game.opponent}">
        <label for=game-opponent>
            <a href="?$${teamQuery}&gameId=${game.id}">${game.opponent || "Unknown"}</a>
            <span class=editable-pencil>&#9998;</span>
        </label>
    </div>
</form>
`
}

let addGameValidator = {
    date: createString25("Game Date"),
    opponent: maybe(createString25("Game Opponent"))
}

let editGameValidator = {
    ...addGameValidator,
    gameId: createIdNumber("Game ID")
}

const postHandlers : PostHandlers = {
    async post({ data, query }) {
        let [{ date, opponent }, { teamId }] = await validate([
            validateObject(data, addGameValidator),
            validateObject(query, queryTeamIdValidator)])

        let team = await teamGet(teamId)
        await assert.isFalse(
            !!team.games.find(x => x.date === date && x.opponent === opponent),
            `The game "${date}${when(opponent, " - " + opponent)}" already exists!`)

        let gameId = getNewId(team.games.map(x => x.id))

        team.games.push({
            id: gameId,
            date,
            opponent,
            points: 0,
            opponentPoints: 0,
            gameTime: []
        })

        await teamSave(team)
    },
    async edit({ data, query }) {
        let [{ date, opponent, gameId }, { teamId }] = await validate([
            validateObject(data, editGameValidator),
            validateObject(query, queryTeamIdValidator)])

        let team = await teamGet(teamId)
        await assert.isFalse(
            !!team.games.find(x => gameId !== x.id && x.date === date && x.opponent === opponent),
            `The game "${date}${when(opponent, " - " + opponent)}" already exists!`)

        let game = await required(team.games.find(x => gameId === x.id), "Could not find game!")
        game.opponent = opponent
        game.date = date

        await teamSave(team)
    },
}

const router : Route = {
    route: /\/games\/$/,
    async get(req: Request) {
        const result = await start(req)
        return layout(req, { main: render(result) })
    },
    post: postHandlers,
}

export default router
