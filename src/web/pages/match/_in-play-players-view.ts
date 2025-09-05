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
        let id = `in-player-${player?.playerId}`
        let subPlayerId = `sub-player-${sub?.playerId}`
       return html`
<form
    $${when(!sub, () => `id="${id}"`)}
    $${when(sub && !player, () => `id="${subPlayerId}"`)}
    traits="game-shader"
    data-total="${gameCalc.currentTotal()}"
    data-value="${player?.calc.currentTotal()}"
    class="list m-0
${
() =>
    player && sub
        ? html`">${twoPlayerView(player, sub, isGameInPlay, queryTeamGame, id, subPlayerId)}`
    : player
        ? html`">${playerView(player, isGameInPlay, queryTeamGame, id)}`
    : sub
        ? html`">${subPlayerView(sub, queryTeamGame, subPlayerId)}`
    : html` empty">`
}</form>`
    }, { gridItemWidth: "8em" })
}

function twoPlayerView(
        player: GamePlayerStatusView<InPlayPlayer>,
        sub: GamePlayerStatusView<OnDeckPlayer>,
        isGameInPlay: boolean,
        queryTeamGame: string,
        inPlayerId: string,
        subPlayerId: string
) {
    return html`
<div id="${inPlayerId}">
${playerView(player, isGameInPlay, queryTeamGame, inPlayerId)}
</div>
<div id="${subPlayerId}">
${subPlayerView(sub, queryTeamGame, subPlayerId)}
</div>`
}

function playerView(
        player: GamePlayerStatusView<InPlayPlayer>,
        isGameInPlay: boolean,
        queryTeamGame: string,
        id: string) {

    return html`
<fieldset class="mb-0" role="group">
    <button
        class="in-play-button"
        formmethod="get"
        formaction="/web/match?$${queryTeamGame}&playerId=${player?.playerId}&handler=playerSwap"
        hf-target="#app">${player?.name}</button>
    <button
        class="in-play-button"
        formmethod=post
        formaction="/web/match?${queryTeamGame}&playerId=${player.playerId}&handler=playerNowOut"
        hf-target="#$${id}"
        >X</button>
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
        queryTeamGame: string,
        id: string) {
    return html`
<fieldset class="mb-0" role="group">
    <button
        class="in-play-button"
        formmethod=post
        formaction="/web/match?$${queryTeamGame}&playerId=${sub.playerId}&handler=swap"
        hf-target="#app">(${sub.name})</button>
    <button
        class="in-play-button"
        formmethod=post
        formaction="/web/match?$${queryTeamGame}&playerId=${sub.playerId}&handler=cancelOnDeck"
        hf-target="#$${id}"
        >X</button>
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