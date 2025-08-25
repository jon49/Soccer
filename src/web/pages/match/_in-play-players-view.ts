import { GamePlayerStatusView, PlayerStateView, positionPlayersView } from "./shared.js";
import type { InPlayPlayer, OnDeckPlayer } from "../../server/db.js";

let {
    html,
    utils: {when}
} = self.app

export function inPlayersView(state: PlayerStateView) {
    return positionPlayersView(state, async ({
        player,
        playerOnDeck,
    }) => {
        let gameCalc = await state.gameCalc()
        let isGameInPlay = await state.isGameInPlay()
        let sub = playerOnDeck
        let queryTeamGame = state.queryTeamGame
       return html`
<form
    traits="game-shader"
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
    : html` empty"><div></div><div></div><div></div>`
}</form>`
    }, { gridItemWidth: "8em" })
}

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
<fieldset class="mb-0" role="group">
    <button
        class="in-play-button"
        formmethod="get"
        formaction="/web/match?$${queryTeamGame}&playerId=${player?.playerId}&handler=playerSwap"
        hf-target="#dialogs">${player?.name}</button>
    <button
        class="in-play-button"
        formmethod=post
        formaction="/web/match?${queryTeamGame}&playerId=${player.playerId}&handler=playerNowOut"
        hf-target="#dialogs">X</button>
</fieldset>
<div
    class="in-play-timer"
    traits="game-timer"
    data-start="${player.calc.getLastStartTime()}"
    data-total="${player.calc.total()}"
    ${when(!isGameInPlay, "data-static")}>00:00</div>
`
}

function subPlayerView(
        sub: GamePlayerStatusView<OnDeckPlayer>,
        queryTeamGame: string) {
    return html`
<fieldset class="mb-0" role="group">
    <button
        class="in-play-button"
        formmethod=post
        formaction="/web/match?$${queryTeamGame}&playerId=${sub.playerId}&handler=swap"
        hf-target="#dialogs">(${sub.name})</button>
    <button
        class="in-play-button"
        formmethod=post
        formaction="/web/match?$${queryTeamGame}&playerId=${sub.playerId}&handler=cancelOnDeck"
        hf-target="#dialogs">X</button>
</fieldset>
<div
    class="in-play-timer"
    traits="game-timer"
    data-start="${sub.calc.getLastStartTime()}"
    data-total="${sub.calc.total()}"
    data-static
    >00:00</div>
`
}