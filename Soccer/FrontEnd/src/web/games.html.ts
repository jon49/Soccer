import { cache, Game, Message, Team } from "./server/db"
import html from "./server/html-template-tag"
import { teamGet, teamSave } from "./server/repo-team"
import { PostHandlers } from "./server/route"
import { messageView, when } from "./server/shared"
import { getNewId, searchParams, tail } from "./server/utils"
import { assert, createString25, optional, validate, validateObject } from "./server/validation"
import { queryTeamIdValidator } from "./server/validators"
import layout from "./_layout.html"

interface GameView {
    team: Team
    posted: string | undefined
    message: Message
}

async function start(req: Request): Promise<GameView> {
    let [message, posted] = await Promise.all([cache.pop("message"), cache.pop("posted")])
    let { teamId } = await validateObject(searchParams(req), queryTeamIdValidator)
    let team = await teamGet(teamId)
    return {team, message, posted}
}

function render(view: GameView) {
    let { team, posted, message } = view
    let hasGames = team.games.length > 0
    let gameAdded = posted === "add-game"
    return html`
<h2>${team.name} - Games</h2>

${when(!gameAdded, messageView(message))}
${when(!hasGames, html`<p>No games found.</p>`)}

${when(hasGames, html`
<ul id=games class=list>
    ${team.games.map(x => {
        return html`
        <li>
            <a href="?teamId=${team.id}&gameId=${x.id}">${x.date}${when(x.opponent, " - " + x.opponent) }</a>
            <a href="/web/games/edit?teamId=${team.id}&gameId=${x.id}">Edit</a>
        </li>`
    })}
</ul>`)}

${when(gameAdded, messageView(message))}

<form class=form method=post target=#games hf-swap=append>
    <div class=inline>
        <label for=game-date>Name</label>
        <input id=game-date type=date name=date required value=${new Date().toISOString().slice(0, 10)} ${when(gameAdded || !hasGames, "autofocus")}>
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
    return html`
        <li>
            <a href="?teamId=${teamId}&gameId=${game.id}">${game.date}${when(game.opponent, " - " + game.opponent) }</a>
            <a href="/web/games/edit?teamId=${teamId}&gameId=${game.id}">Edit</a>
        </li>`

}

let addGameValidator = {
    date: createString25("Game Date"),
    opponent: optional(createString25("Game Opponent"))
}

const postHandlers : PostHandlers = {
    post: async function({ data, query }) {
        await cache.push({posted: "add-game"})
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
        return getGameView(team.id, tail(team.games))
    }
}

export default {
    route: /\/games\/$/,
    async get(req: Request) {
        const result = await start(req)
        const template = await layout(req)
        return template({ main: render(result) })
    },
    post: postHandlers,
}
