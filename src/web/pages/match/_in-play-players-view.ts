import html from "html-template-tag-stream"
import { GamePlayerStatusView, PlayerStateView } from "./shared.js"
import { InPlayPlayer, OnDeckPlayer } from "../../server/db.js"
import { when } from "@jon49/sw/utils.js"
import { playerPositionsView } from "./_player-position-view.js"

function twoPlayerView(
        player: GamePlayerStatusView<InPlayPlayer>,
        sub: GamePlayerStatusView<OnDeckPlayer>,
        isGameInPlay: boolean,
        queryTeamGame: string
) {
    return html`
${playerView(player, isGameInPlay, queryTeamGame)}
${subPlayerView(sub, queryTeamGame)}`
}

function playerView(
        player: GamePlayerStatusView<InPlayPlayer>,
        isGameInPlay: boolean,
        queryTeamGame: string) {

    return html`
    <li>
        <form
            action="/web/match?$${queryTeamGame}&playerId=${player?.playerId}&handler=playerSwap"
            hf-target="#dialogs" >
            <button>${player?.name}</button>
        </form>
        <span traits="game-timer"
            data-start="${player.calc.getLastStartTime()}"
            data-total="${player.calc.total()}"
            ${when(!isGameInPlay, "data-static")}>
            00:00
        </span>
        <form
            method=post
            action="/web/match?${queryTeamGame}&playerId=${player.playerId}&handler=playerNowOut"
            hf-target="#dialogs"
            >
            <button>X</button>
        </form>
    </li>`
}

function subPlayerView(
        sub: GamePlayerStatusView<OnDeckPlayer>,
        queryTeamGame: string) {
    return html`
<li>
    <form
        method=post
        action="/web/match?$${queryTeamGame}&playerId=${sub.playerId}&handler=swap"
        hf-target="#dialogs"
        >
        <button>(${sub.name})</button>
    </form>
    <span traits="game-timer"
        data-start="${sub.calc.getLastStartTime()}"
        data-total="${sub.calc.total()}"
        data-static>
    00:00
    </span>
    <form
        method=post
        action="/web/match?$${queryTeamGame}&playerId=${sub.playerId}&handler=cancelOnDeck"
        hf-target="#dialogs"
        >
        <button class=danger>X</button>
    </form>
</li>`
}

export default async function inPlayPlayersView(state: PlayerStateView) {
    let [
        isGameInPlay,
        inPlayPlayers,
        gameCalc,
        playersOnDeck,
        isGameEnded,
        isGamePaused,
    ] = await Promise.all([
        state.isGameInPlay(),
        state.inPlayPlayers(),
        state.gameCalc(),
        state.onDeckPlayers(),
        state.isGameEnded(),
        state.isGamePaused(),
    ])

    let queryTeamGame = state.queryTeamGame

    let countOnDeckPlayers = playersOnDeck.length
    let onDeckWithoutPosition = playersOnDeck.filter(x => x.status.targetPosition == null)
    let noPlayersExist = !inPlayPlayers.length && !countOnDeckPlayers
    let playersExist = !noPlayersExist

    let view = playerPositionsView({
        playerStateView: state,
        title: html`In-Play Players ${when(noPlayersExist, "(No Players) ")}
<div class=flex>
<div>
${when(countOnDeckPlayers > 0, () => html`
<button
    form=post-form
    formaction="/web/match?$${queryTeamGame}&handler=swapAll"
    hf-target="#dialogs">Swap All</button>
`)}
${when(playersExist, () => html`
<button
    form=post-form
    formaction="/web/match?$${queryTeamGame}&handler=allOut"
    hf-target="#dialogs">All Out</button>
`)}
</div>

<div>
    ${when(!isGameEnded, () => html`
    <button id=game-status
        form=post-form
        formaction="/web/match?$${queryTeamGame}&handler=${isGameInPlay ? "pauseGame" : "startGame"}"
        hf-target="#dialogs" >
        ${isGameInPlay ? "Pause" : "Start"}
    </button>`)}

    <span traits="game-timer"
        $${when(isGamePaused, () => `data-flash data-start="${gameCalc.getLastEndTime()}"`)}
        $${when(isGameInPlay, `data-start="${gameCalc.getLastStartTime()}" data-total="${gameCalc.total()}"`)}
        $${when(isGameEnded, `data-static data-total="${gameCalc.total()}"`)}>
        00:00
    </span>

    <button
        form=post-form
        formaction="/web/match?$${queryTeamGame}&handler=${isGameEnded ? "restartGame" : "endGame"}"
        hf-target="#dialogs"
        >
        ${isGameEnded ? "Restart" : "End"}
    </button>
</div>

<div>
<button
    form="get-form"
    formaction="/web/match?teamId=1&amp;gameId=1&amp;activityId=1&amp;handler=activityPlayerSelector&amp;action=inc"
    hf-target="#dialogs"
    aria-label="Game points ${gameCalc.game.points}"
    >${gameCalc.game.points}</button>
    VS
<button
    form=post-form
    formaction="/web/match?$${queryTeamGame}&handler=oPointsInc"
    hf-target="this"
    aria-label="Opponent points ${gameCalc.game.opponentPoints}"
    >${gameCalc.game.opponentPoints}</button>
</div>
</div>`,
        keepOpen: true,
        playerView: ({ player, playerOnDeck: sub }) => {
            return html`
            <ul traits="game-shader"
                data-total="${gameCalc.currentTotal()}"
                data-value="${player?.calc.currentTotal()}"
                class="list m-0
            ${
            () =>
                player && sub
                    ? html`">${twoPlayerView(player, sub, isGameInPlay, queryTeamGame)}`
                : player
                    ? html`">${playerView(player, isGameInPlay, queryTeamGame)}`
                : sub
                    ? html`">${subPlayerView(sub, queryTeamGame)}`
                : html` empty"><li></li><li></li><li></li>`
            }</ul>`
        },
        slot: onDeckWithoutPosition.length
            ?  html`<h3 class=inline>On Deck</h3>
            <button
                class="condense-padding"
                form="get-form"
                formaction="/web/match?${queryTeamGame}&handler=rapidFire"
                hf-target="#dialogs">Rapid Fire</button>

            <ul class=list>
                ${onDeckWithoutPosition.map(x => html`
                <li id="on-deck-${x.playerId}">
                    <form
                        action="/web/match?${queryTeamGame}&playerId=${x.playerId}&handler=playerSwap"
                        hf-target="#dialogs">
                        <button>(${x.name})</button>
                    </form>
                    <form
                        method=post
                        action="/web/match?${queryTeamGame}&playerId=${x.playerId}&handler=cancelOnDeck"
                        hf-target="#on-deck-${x.playerId}">
                        <button>X</button>
                    </form>
                </li>
            `)}
            </ul>`
            : null
    })

    return view
}
