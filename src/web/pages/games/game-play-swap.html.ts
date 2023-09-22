import html from "html-template-tag-stream"
import { PostHandlers, Route } from "../../server/route.js"
import layout from "../_layout.html.js"
import { validateObject } from "promise-validation"
import { searchParams } from "../../server/utils.js"
import { createIdNumber, createPositiveWholeNumber, required } from "../../server/validation.js"
import { queryTeamIdGameIdValidator } from "../../server/validators.js"
import { playerGameAllGet, positionGetAll } from "../../server/repo-player-game.js"
import { teamGet } from "../../server/repo-team.js"
import { createPlayersView, filterInPlayPlayers, filterOnDeckPlayers, GameTimeCalculator, PlayerGameTimeCalculator } from "./shared.js"
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
    let gameTimeCalculator = new GameTimeCalculator(game)
    let inPlayPlayers = await createPlayersView(filterInPlayPlayers, team.players, players)
    let onDeckPlayers = await createPlayersView(filterOnDeckPlayers, team.players, players)
    let player = await required(team.players.find(x => x.id === playerId), "Could not find player ID!")

    let isInPlay = game.status === "play"
    let isEnded = game.status === "ended"
    let isPaused = game.status === "paused" || (!isInPlay && !isEnded)

    return html`
<h2 id=game-swap-top>Swap for ${player.name}</h2>
${function* positionViews() {
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
            let isCurrentPlayer = player?.playerId === playerId
            let row = html`<form method=post action="?position=${count}&teamId=${teamId}&gameId=${gameId}&playerId=${playerId}&handler=updateUserPosition&playerSwap">${
            () => {
                if (player) {
                    let playerGameCalc = new PlayerGameTimeCalculator(player)
                    return html`
                <game-shader data-total="${gameTimeCalculator.currentTotal()}" data-value="${playerGameCalc.currentTotal()}">
                    <button
                    ${when(playerOnDeck || isCurrentPlayer, "disabled")}
                    title="${when(playerOnDeck, "Player is on deck already.")}${when(isCurrentPlayer, "You cannot swap the same player!")}">
                        ${player.name}${when(playerOnDeck, p => html` (${p.name})`)}
                        <game-timer
                            data-start="${player.calc.getLastStartTime()}"
                            data-total="${player.calc.total()}"
                            $${when(isPaused, `data-static`)}>
                            ></game-timer>
                    </button>
                </game-shader>`
                }
                if (playerOnDeck) {
                    let playerOnDeckGameCalc = new PlayerGameTimeCalculator(playerOnDeck)
                    return html`
                    <button disabled>
                        (${playerOnDeck.name})
                        <game-timer
                            data-start=${playerOnDeckGameCalc.start()}
                            data-total="${playerOnDeckGameCalc.total()}"
                            $${when(isPaused, `data-static`)}>
                            ></game-timer></button>`
                }
                return html`<button>${p[i]}</button>`
            }
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
        let inGamePlayer =
            players
            .filter(filterInPlayPlayers)
            .find(x => x.status.position === position)

        if (player.status?._ === "inPlay") {
            if (inGamePlayer) {
                inGamePlayer.status = {
                    _: "inPlay",
                    position: player.status.position,
                }
            }
            player.status = {
                _: "inPlay",
                position,
            }
        } else {
            player.status = {
                _: "onDeck",
                targetPosition: position,
                currentPlayerId: inGamePlayer?.playerId,
            }
        }
        let playerCalc = new PlayerGameTimeCalculator(player)
        let gameOn = playerCalc.isGameOn()
        if (player.status._ === "onDeck") {
            playerCalc.position(positions[position])
        }

        if (player.status._ === "inPlay") {
            let positionName = positions[position]
            if (gameOn) {
                playerCalc.end()
                playerCalc.position(positionName)
                playerCalc.start()
            } else {
                playerCalc.position(positionName)
            }

            if (inGamePlayer) {
                let inGamePlayerCalc = new PlayerGameTimeCalculator(inGamePlayer)
                let positionName = positions[player.status.position]
                if (gameOn) {
                    inGamePlayerCalc.end()
                    inGamePlayerCalc.position(positionName)
                    inGamePlayerCalc.start()
                } else {
                    inGamePlayerCalc.position(positionName)
                }
                await inGamePlayerCalc.save(teamId)
            }
        }
        await playerCalc.save(teamId)
        let url = new URL(req.referrer)
        url.search = `?teamId=${teamId}&gameId=${gameId}`
        return Response.redirect(url.toString(), 303)
    },
}

const route : Route = {
    route: (url: URL) => url.pathname.endsWith("/games/") && url.searchParams.has("playerSwap"),
    async get(req: Request) {
        let main = await render(req)
        let head = `
        <script src="/web/js/game-timer.js"></script>
        <script src="/web/js/game-shader.js"></script>`
        return layout(req, {
            head,
            main,
            title: "Game Play Swap" })
    },
    post: postHandlers,
}

export default route

