import { Game, Team } from "../server/db.js"
import html from "../server/html.js"
import { teamGet, teamSave } from "../server/repo-team.js"
import { PostHandlers, Route } from "../server/route.js"
import { when } from "../server/shared.js"
import { equals, getNewId, searchParams } from "../server/utils.js"
import { assert, createCheckbox, createDateTimeString, createIdNumber, createString50, required, validate, validateObject } from "../server/validation.js"
import { queryTeamIdValidator } from "../server/validators.js"
import layout from "./_layout.html.js"
import { teamNav } from "./_shared-views.js"

interface GameView {
    team: Team
}

async function start(req: Request): Promise<GameView> {
    let { teamId } = await validateObject(searchParams(req), queryTeamIdValidator)
    let team = await teamGet(teamId)
    return { team }
}

function render({ team }: GameView) {
    team.games.sort((a, b) => b.date.localeCompare(a.date))
    return html`
<h2>${team.name} - Games</h2>

<ul id=games class=list>
    ${team.games.map(x => getGameView(team.id, x))}
</ul>

<form class="form" method=post action="/web/games?teamId=${team.id}" hf-target=main>
    <div class=row>
        <div>
            <label for=game-date>Name</label>
            <input id=game-date type=datetime-local name=date required ${when(team.games.length === 0, "autofocus")}>
        </div>
        <div>
            <label for=game-opponent>Opponent</label>
            <input id=game-opponent type=text name=opponent required>
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

async function renderMain(req: Request) {
    return render(await start(req))
}

function getGameView(teamId: number, game: Game) {
    return html`<li onchange="event.target.form.requestSubmit()" id=game-${game.id}>${getGamePartialView(teamId, game)}</li>`
}

function formatTime(date: Date | undefined) {
    if (!date) return ""
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

function getGamePartialView(teamId: number, game: Game) {
    let teamQuery = `teamId=${teamId}`
    let formId = `game-form-${game.id}`
    let datetime = game.date && game.time ? `${game.date}T${game.time}` : ""
    let d = new Date(datetime)
    return html`
<input form=${formId} type=hidden name=gameId value="${game.id}" hf-target=main>
<input
    id="game-date-${game.id}"
    form=${formId}
    class=editable
    type=datetime-local
    name=date
    required
    value="$${datetime}"
    >
<label for="game-date-${game.id}">
    <a href="/web/games?$${teamQuery}&gameId=${game.id}">${game.date} (${formatTime(d)})</a>
    <span class=editable-pencil>&#9998;</span>
</label>
<input
    id="game-opponent-${game.id}"
    form=${formId}
    class=editable
    type=text
    name=opponent
    value="${game.opponent}">
<label for="game-opponent-${game.id}">
    <a href="/web/games?$${teamQuery}&gameId=${game.id}">${game.opponent}</a>
    <span class=editable-pencil>&#9998;</span>
</label>
<input form=${formId} class=inline id="home-${game.id}" type=checkbox name=home $${when(game.home, "checked")}>
<label for="home-${game.id}">Home</label>
<form id=${formId} class=hidden method=post action="/web/games?${teamQuery}&handler=edit" onchange="this.requestSubmit()" hf-target=main></form>
`
}

let addGameValidator = {
    date: createDateTimeString("Game Date"),
    opponent: createString50("Game Opponent"),
    home: createCheckbox,
}

let editGameValidator = {
    ...addGameValidator,
    gameId: createIdNumber("Game ID")
}

const postHandlers: PostHandlers = {
    async post({ req, data, query }) {
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

        return renderMain(req)
    },

    async edit({ req, data, query }) {
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

        return renderMain(req)
    },
}

const router: Route = {
    route: /\/games\/$/,
    async get(req: Request) {
        let search = searchParams<{ teamId: string }>(req)
        return layout(req, {
            main: await renderMain(req),
            nav: teamNav(+search.teamId),
            title: "Games"
        })
    },
    post: postHandlers,
}

export default router
