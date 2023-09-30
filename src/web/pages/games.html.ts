import { Game, Team } from "../server/db.js"
import html from "../server/html.js"
import { teamGet, teamSave } from "../server/repo-team.js"
import { PostHandlers, Route } from "../server/route.js"
import { when } from "../server/shared.js"
import { equals, getNewId, searchParams } from "../server/utils.js"
import { assert, createCheckbox, createDateTimeString, createIdNumber, createString25, maybe, required, validate, validateObject } from "../server/validation.js"
import { queryTeamIdValidator } from "../server/validators.js"
import layout from "./_layout.html.js"

interface GameView {
    team: Team
}

async function start(req: Request): Promise<GameView> {
    let { teamId } = await validateObject(searchParams(req), queryTeamIdValidator)
    let team = await teamGet(teamId)
    return { team }
}

function render({ team }: GameView) {
    return html`
<h2>${team.name} - Games</h2>

<ul id=games class=list>
    ${team.games.map(x => getGameView(team.id, x))}
</ul>

<form class="form" method=post>
    <div class=row>
        <div>
            <label for=game-date>Name</label>
            <input id=game-date type=datetime-local name=date required ${when(team.games.length === 0, "autofocus")}>
        </div>
        <div>
            <label for=game-opponent>Opponent</label>
            <input id=game-opponent type=text name=opponent>
        </div>
    </div>

    <div class=row>
        <div>
            <input class=inline id=home type=checkbox name=home>
            <label for=home>Home</label>
        </div>
        <div>
            <button>Save</button>
        </div>
    </div>
</form>
`
}

function getGameView(teamId: number, game: Game) {
    return html`<li id=game-${game.id}>${getGamePartialView(teamId, game)}</li>`
}

function formatTime(time: string | undefined) {
    if (!time) return ""
    let hours = time.slice(0, 2)
    let minutes = time.slice(3, 5)
    let ampm = hours < "12" ? "AM" : "PM"
    return `${hours}:${minutes} ${ampm}`
}

function getGamePartialView(teamId: number, game: Game) {
    let teamQuery = `teamId=${teamId}`
    return html`
<form method=post action="?${teamQuery}&handler=edit" onchange="this.submit()">
    <input type=hidden name=gameId value="${game.id}">
    <div class=table>
        <div>
            <div>
                <input
                    id="game-date-${game.id}"
                    class=editable
                    type=datetime-local
                    name=date
                    required
                    value="${game.date}${when(game.time, x => html`T$${x}`)}">
                <label for="game-date-${game.id}">
                    <a href="?$${teamQuery}&gameId=${game.id}">${game.date} (${formatTime(game.time)})</a>
                    <span class=editable-pencil>&#9998;</span>
                </label>
            </div>
            <div>
                <input
                    id="game-opponent-${game.id}"
                    class=editable
                    type=text
                    name=opponent
                    value="${game.opponent}">
                <label for="game-opponent-${game.id}">
                    <a href="?$${teamQuery}&gameId=${game.id}">${game.opponent}</a>
                    <span class=editable-pencil>&#9998;</span>
                </label>
            </div>
            <div>
                <input class=inline id="home-${game.id}" type=checkbox name=home $${when(game.home, "checked")}>
                <label for="home-${game.id}">Home</label>
            </div>
        </div>
    </div>
</form>
`
}

let addGameValidator = {
    date: createDateTimeString("Game Date"),
    opponent: maybe(createString25("Game Opponent")),
    home: createCheckbox,
}

let editGameValidator = {
    ...addGameValidator,
    gameId: createIdNumber("Game ID")
}

const postHandlers: PostHandlers = {
    async post({ data, query }) {
        let [{ date: datetime, opponent, home }, { teamId }] = await validate([
            validateObject(data, addGameValidator),
            validateObject(query, queryTeamIdValidator)])

        opponent = opponent || "Unknown"

        let [date, time] = datetime.split("T")

        let team = await teamGet(teamId)
        let existingTeam =
            team.games
            .find(x => equals(x.date, date) && equals(x.opponent || "", opponent || ""))
        await assert.isFalse(
            !!team.games.find(x => equals(x.date, date) && equals(x.opponent || "", opponent || "")),
            `The game "${date}${when(existingTeam?.opponent, " - " + existingTeam?.opponent)}" already exists!`)

        let gameId = getNewId(team.games.map(x => x.id))

        team.games.push({
            id: gameId,
            date,
            time,
            home,
            opponent,
            points: 0,
            opponentPoints: 0,
            gameTime: []
        })

        await teamSave(team)
    },
    async edit({ data, query }) {
        let [{ date: datetime, opponent, gameId, home }, { teamId }] = await validate([
            validateObject(data, editGameValidator),
            validateObject(query, queryTeamIdValidator)])

        opponent = opponent || "Unknown"

        let [date, time] = datetime.split("T")

        let team = await teamGet(teamId)
        await assert.isFalse(
            !!team.games.find(x => gameId !== x.id && x.date === date && x.opponent === opponent),
            `The game "${date}${when(opponent, " - " + opponent)}" already exists!`)

        let game = await required(team.games.find(x => gameId === x.id), "Could not find game!")
        game.opponent = opponent
        game.date = date
        game.time = time
        game.home = home

        await teamSave(team)
    },
}

const router: Route = {
    route: /\/games\/$/,
    async get(req: Request) {
        const result = await start(req)
        return layout(req, { main: render(result), title: "Games" })
    },
    post: postHandlers,
}

export default router
