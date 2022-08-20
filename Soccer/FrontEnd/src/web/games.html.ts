import { cache, Message, Team } from "./js/db"
import html from "./js/html-template-tag"
import { teamGet, teamSave } from "./js/repo-team"
import { handlePost, RoutePostArgsWithType } from "./js/route"
import { messageView, when } from "./js/shared"
import { searchParams } from "./js/utils"
import { assert, createString25, optional, validate, validateObject } from "./js/validation"
import { queryTeamValidator } from "./js/validators"
import layout from "./_layout.html"

interface GameView {
    team: Team
    posted: string | undefined
    message: Message
}

async function start(req: Request): Promise<GameView> {
    let [message, posted] = await Promise.all([cache.pop("message"), cache.pop("posted")])
    let query = await validateObject(<{team: string}>searchParams<{team: string}>(req), queryTeamValidator)
    let team = await teamGet(query.team)
    return {team, message, posted}
}

function render(view: GameView) {
    let { team, posted, message } = view
    let hasGames = team.games.length > 0
    let gameAdded = posted === "add-game"
    return html`
<h2>Games</h2>

${when(!gameAdded, messageView(message))}
${when(!hasGames, html`<p>No games found.</p>`)}

${when(hasGames, html`
<ul class=list>
    ${team.games.map(x => {
        return html`
        <li>
            <a href="?team=${team.id}&game=${x.id}">${x.date}${when(x.opponent, " - " + x.opponent) }</a>
            <a href="/web/games/edit?team=${team.id}&game=${x.id}">Edit</a>
        </li>`
    })}
</ul>`)}

${when(gameAdded, messageView(message))}

<form class=form method=post>
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

let addGameValidator = {
    date: createString25("Game Date"),
    opponent: optional(createString25("Game Opponent"))
}

const postHandlers = {
    post: async function({ data, query }: RoutePostArgsWithType<{date: string, opponent?: string}, {team: string}>) {
        await cache.push({posted: "add-game"})
        let [{ date, opponent }, {team: teamId}] = await validate([
            validateObject(data, addGameValidator),
            validateObject(query, queryTeamValidator)])

        let team = await teamGet(teamId)
        await assert.isFalse(
            !!team.games.find(x => x.date === date && x.opponent === opponent),
            `The game "${date}${when(opponent, " - " + opponent)}" already exists!`)

        team.games.push({
            id: +new Date(),
            date,
            opponent,
        })

        await teamSave(team)
        return
    }
}

export default {
    route: /\/games\/$/,
    async get(req: Request) {
        const result = await start(req)
        const template = await layout(req)
        return template({ main: render(result) })
    },
    post: handlePost(postHandlers),
}
