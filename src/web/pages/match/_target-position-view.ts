import html from "html-template-tag-stream"
import { isInPlayPlayer, GameTimeCalculator, PlayerGameTimeCalculator, PlayerStateView } from "./shared.js"
import { when } from "../../server/html.js"
import { queryTeamIdGameIdValidator } from "../../server/validators.js"
import { createIdNumber } from "@jon49/sw/validation.js"
import { validateObject } from "promise-validation"
import { playerPositionsView } from "./_player-position-view.js"

const querySwapValidator = {
    ...queryTeamIdGameIdValidator,
    playerId: createIdNumber("Player ID"),
}

export default async function render(query: any) {
    let { teamId, gameId, playerId } = await validateObject(query, querySwapValidator)

    let playerStateView = new PlayerStateView(teamId, gameId)
    let [ isPaused, player, playerGame, game ] = await Promise.all([
        playerStateView.isGamePaused(),
        playerStateView.player(playerId),
        playerStateView.playerGame(playerId),
        playerStateView.game(),
    ])

    let gameTimeCalculator = new GameTimeCalculator(game)

    return playerPositionsView({
        playerStateView,
        title: `Swap for ${player.name}`,
        playerView: ({ player, playerOnDeck, position, count }) => {
            let isCurrentPlayer = player?.playerId === playerId
            return html`
            <form
                method=post
                action="/web/match?position=${count}&teamId=${teamId}&gameId=${gameId}&playerId=${playerId}&handler=updateUserPosition&playerSwap"
                hf-target="#player-state"
                $${when(!isInPlayPlayer(playerGame), `hf-scroll-to="#out-players"`)}
                >${
            () => {
                if (player) {
                    let playerGameCalc = new PlayerGameTimeCalculator(player, gameTimeCalculator)
                    return html`
                    <button
                        traits=game-shader
                        data-total="${gameTimeCalculator.currentTotal()}"
                        data-value="${playerGameCalc.currentTotal()}"
                        ${when(isCurrentPlayer, "disabled")}
                        title="${when(playerOnDeck, "Player is on deck already.")}
                        ${when(isCurrentPlayer, "You cannot swap the same player!")}">
                        ${player.name}
                        ${when(playerOnDeck, p => html` (${p.name})`)}
                        <span traits="game-timer"
                            data-start="${player.calc.getLastStartTime()}"
                            data-total="${player.calc.total()}"
                            $${when(isPaused, `data-static`)}>
                        </span>
                    </button>`
                }
                if (playerOnDeck) {
                    let playerOnDeckGameCalc = new PlayerGameTimeCalculator(playerOnDeck, gameTimeCalculator)
                    return html`
                    <button>
                        (${playerOnDeck.name})
                        <span traits=game-timer
                            data-start=${playerOnDeckGameCalc.start()}
                            data-total="${playerOnDeckGameCalc.total()}"
                            $${when(isPaused, `data-static`)}>
                        </span>
                    </button>`
                }
                return html`<button>${position[count]}</button>`
            }
                }</form>
            `
        },
    })
}
