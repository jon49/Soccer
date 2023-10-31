import html from "html-template-tag-stream"
import { searchParams } from "../../server/utils.js"
import { playerGameAllGet, positionGetAll } from "../../server/repo-player-game.js"
import { teamGet } from "../../server/repo-team.js"
import { createPlayersView, isInPlayPlayer, isOnDeckPlayer, GameTimeCalculator, PlayerGameTimeCalculator } from "./shared.js"
import { when } from "../../server/html.js"
import { queryTeamIdGameIdValidator } from "../../server/validators.js"
import { createIdNumber, required } from "../../server/validation.js"
import { validateObject } from "promise-validation"

const querySwapValidator = {
    ...queryTeamIdGameIdValidator,
    playerId: createIdNumber("Player ID"),
}

export default async function render(req: Request) {
    let { teamId, gameId, playerId } = await validateObject(searchParams(req), querySwapValidator)
    let team = await teamGet(teamId)
    team.players = team.players.filter(x => x.active)
    let [players, { grid, positions }] = await Promise.all([
        playerGameAllGet(teamId, gameId, team.players.map(x => x.id)),
        positionGetAll(teamId),
    ])

    let game = await required(team.games.find(x => x.id === gameId), "Could not find game ID!")
    let gameTimeCalculator = new GameTimeCalculator(game)
    let inPlayPlayers = await createPlayersView(isInPlayPlayer, team.players, players)
    let onDeckPlayers = await createPlayersView(isOnDeckPlayer, team.players, players)
    let player = await required(team.players.find(x => x.id === playerId), "Could not find player ID!")

    let isInPlay = game.status === "play"
    let isEnded = game.status === "ended"
    let isPaused = game.status === "paused" || (!isInPlay && !isEnded)

    return html`
<h2 id=game-swap-top class=inline>Swap for ${player.name}</h2>
<form
    class=inline
    action="?teamId=${teamId}&gameId=${gameId}&handler=cancelSwap"
    hf-target="#player-state"
    hf-scroll="#out-players"
    >
    <button>Cancel Swap</button>
</form>

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
                    let row =
                        html`<form
                method=post
                action="?position=${count}&teamId=${teamId}&gameId=${gameId}&playerId=${playerId}&handler=updateUserPosition&playerSwap"
                hf-target="#player-state"
                hf-scroll="#out-players" >${() => {
                                if (player) {
                                    let playerGameCalc = new PlayerGameTimeCalculator(player)
                                    return html`
                <game-shader data-total="${gameTimeCalculator.currentTotal()}" data-value="${playerGameCalc.currentTotal()}">
                    <button
                    ${when(isCurrentPlayer, "disabled")}
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
                    <button>
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
        }}`

}
