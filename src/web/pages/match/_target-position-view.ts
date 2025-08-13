import html from "html-template-tag-stream"
import { playerGameAllGet } from "../../server/repo-player-game.js"
import { teamGet } from "../../server/repo-team.js"
import { isInPlayPlayer, GameTimeCalculator, PlayerGameTimeCalculator } from "./shared.js"
import { when } from "../../server/html.js"
import { queryTeamIdGameIdValidator } from "../../server/validators.js"
import { createIdNumber, required } from "@jon49/sw/validation.js"
import { validateObject } from "promise-validation"
import { playerPositionsView } from "./_player-position-view.js"

const querySwapValidator = {
    ...queryTeamIdGameIdValidator,
    playerId: createIdNumber("Player ID"),
}

export default async function render(query: any) {
    let { teamId, gameId, playerId } = await validateObject(query, querySwapValidator)
    let team = await teamGet(teamId)
    team.players = team.players.filter(x => x.active)
    let players = await playerGameAllGet(teamId, gameId, team.players.map(x => x.id))

    let game = await required(team.games.find(x => x.id === gameId), "Could not find game ID!")
    let gameTimeCalculator = new GameTimeCalculator(game)
    let player = await required(team.players.find(x => x.id === playerId), "Could not find player ID!")
    let playerGame = await required(players.find(x => x.playerId === playerId), "Could not find player!")

    let isInPlay = game.status === "play"
    let isEnded = game.status === "ended"
    let isPaused = game.status === "paused" || (!isInPlay && !isEnded)

    return playerPositionsView({
        gameId,
        teamId,
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
                    let playerOnDeckGameCalc = new PlayerGameTimeCalculator(playerOnDeck, gameTimeCalculator)
                    return html`
                    <button>
                        (${playerOnDeck.name})
                        <game-timer
                            data-start=${playerOnDeckGameCalc.start()}
                            data-total="${playerOnDeckGameCalc.total()}"
                            $${when(isPaused, `data-static`)}>
                            ></game-timer></button>`
                }
                return html`<button>${position[count]}</button>`
            }
                }</form>
            `
        },
    })
}
