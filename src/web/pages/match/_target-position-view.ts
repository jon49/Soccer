import { GameTimeCalculator, PlayerGameTimeCalculator, PlayerStateView, positionPlayersView } from "./shared.js"

let {
    html,
    utils: { when },
    validation: { queryTeamIdGameIdValidator, createIdNumber, validateObject }
} = self.sw

const querySwapValidator = {
    ...queryTeamIdGameIdValidator,
    playerId: createIdNumber("Player ID"),
}

export default async function render(query: any) {
    let { teamId, gameId, playerId } = await validateObject(query, querySwapValidator)

    let state = new PlayerStateView(teamId, gameId)
    let [ isPaused, player, game ] = await Promise.all([
        state.isGamePaused(),
        state.player(playerId),
        state.game(),
    ])

    let gameTimeCalculator = new GameTimeCalculator(game)
    let queryTeamGame = state.queryTeamGame

    return html`
<main id=main>
<header>
    <a href="?${queryTeamGame}&handler=play" target="_self">Cancel</a>&nbsp;
    <h2 class="inline">Swap for ${player.name}</h2>
</header>

    ${positionPlayersView(
        state,
        ({ player, playerOnDeck, positionName, positionIndex }) => {
            let isCurrentPlayer = player?.playerId === playerId
            return html`
            <form
                method=post
                action="?position=${positionIndex}&teamId=${teamId}&gameId=${gameId}&playerId=${playerId}&handler=updateUserPosition&playerSwap"
                >${
            async () => {
                if (player) {
                    let shadeBackground = await state.shadeBackgroundStyle(player.playerId)
                    let shadeColor = await state.shadeColorStyle(player.playerId)
                    return html`
                    <button
                        class="game-shader"
                        style="${shadeBackground}; ${shadeColor};"
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
                return html`<button>${positionName}</button>`
            }
                }</form>
            `
        },
        {gridItemWidth: "50px"}
    )}
</main>`
}
