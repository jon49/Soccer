import html from "html-template-tag-stream"
import { PostHandlers, Route } from "../../server/route.js"
import layout from "../_layout.html.js"
import { validateObject } from "promise-validation"
import { searchParams } from "../../server/utils.js"
import { createIdNumber, createPositiveWholeNumber, required } from "../../server/validation.js"
import { queryTeamIdGameIdValidator } from "../../server/validators.js"
import { playerGameAllGet, playerGameSave, positionGetAll } from "../../server/repo-player-game.js"
import { teamGet } from "../../server/repo-team.js"
import { createPlayersView, filterInPlayPlayers, filterOnDeckPlayers, getAggregateGameTime } from "./shared.js"
import { when } from "../../server/html.js"

const querySwapValidator = {
    ...queryTeamIdGameIdValidator,
    playerId: createIdNumber("Player ID"),
}

async function render(req: Request) {
    let { teamId, gameId, playerId } = await validateObject(searchParams(req), querySwapValidator)
    let team = await teamGet(teamId)
    team.players = team.players.filter(x => x.active)
    let [ players, { grid, positions } ] = await Promise.all([
        playerGameAllGet(teamId, gameId, team.players.map(x => x.id)),
        positionGetAll(teamId),
    ])

    let game = await required(team.games.find(x => x.id === gameId), "Could not find game ID!")
    let { total } = getAggregateGameTime(game.gameTime)
    let inPlayPlayers = await createPlayersView(filterInPlayPlayers, team.players, players, total)
    let onDeckPlayers = await createPlayersView(filterOnDeckPlayers, team.players, players, total)

    return html`
<h2>Game Play Swap</h2>
${function* positionViews() {
    console.log("in players", inPlayPlayers)
    console.log("on deck players", onDeckPlayers)
    let count = 0
    for (let width of grid) {
        yield html`<div class="row grid-center">`
        let p = positions.slice(count, count + width)
        if (p.length < width) {
            p = p.concat(new Array(width - p.length))
        }
        yield p.map((_, i) => {
            let player = inPlayPlayers.find(x => count === x.status.position)
            let playerOnDeck = onDeckPlayers.find(x => count === x.status.targetPosition)
            let row = html`<form method=post action="?position=${count}&teamId=${teamId}&gameId=${gameId}&playerId=${playerId}&handler=updateUserPosition&playerSwap">${
                () => player
                        ? html`
                        <button ${when(playerOnDeck, "disabled")}>${player.name} <game-timer data-start=${player.start} data-total="${player.total}"}></game-timer></button>`
                    : playerOnDeck
                        ? html`<button disabled>(${playerOnDeck.name}) <game-timer data-start=${playerOnDeck.start} data-total="${playerOnDeck.total}"}></game-timer></button>`
                    : html`<button>${p[i]}</button>`
                }</form>`
            count++
            return row
        })
        yield html`</div>`
    }
}}
    `
}

const queryPositionUpdateValidator = {
    ...queryTeamIdGameIdValidator,
    playerId: createIdNumber("Player ID"),
    position: createPositiveWholeNumber("Position"),
}

const postHandlers : PostHandlers = {
    async updateUserPosition({ query, req }) {
        let { teamId, playerId, gameId, position } = await validateObject(query, queryPositionUpdateValidator)
        let [ players, { positions } ] = await Promise.all([
            playerGameAllGet(teamId, gameId, []),
            positionGetAll(teamId)
        ])

        let player = await required(players.find(x => x.playerId === playerId), "Could not find swap player!")
        let inGamePlayer = players.find(x =>
            x.status?._ === "inPlay"
            && x.status.position === position)

        player.status = {
            _: "onDeck",
            targetPosition: position,
            currentPlayerId: inGamePlayer?.playerId,
        }
        let gameTime = player.gameTime.find(x => !x.end)
        if (!gameTime) {
            gameTime = {
                position: positions[position],
            }
            player.gameTime.push(gameTime)
        }
        await playerGameSave(teamId, player)
        let url = new URL(req.referrer)
        url.search = `?teamId=${teamId}&gameId=${gameId}`
        return Response.redirect(url.toString(), 303)
    },
}

const route : Route = {
    route: (url: URL) => url.pathname.endsWith("/games/") && url.searchParams.has("playerSwap"),
    async get(req: Request) {
        let main = await render(req)
        return layout(req, { main, title: "Game Play Swap" })
    },
    post: postHandlers,
}

export default route

