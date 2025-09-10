import { GamePlayerStatusView, PlayerStateView, positionPlayersView } from "./shared.js";
import type { InPlayPlayer, OnDeckPlayer } from "../../server/db.js";

let {
    html,
    utils: { when }
} = self.app

export function inPlayersView(state: PlayerStateView) {
    return positionPlayersView(state, async ({
        player,
        playerOnDeck,
    }) => {
        let isGameInPlay = await state.isGameInPlay()
        let sub = playerOnDeck
        let queryTeamGame = state.queryTeamGame
        let id = `in-player-${player?.playerId}`
        let subPlayerId = `sub-player-${sub?.playerId}`

        let shadeBackground = ""
        let shadeColor = ""
        let playerId = player?.playerId
        if (playerId) {
            shadeBackground = await state.shadeBackgroundStyle(playerId)
            shadeColor = await state.shadeColorStyle(playerId)
        }
        let style = `${shadeBackground}; ${shadeColor};`

        let shadeBackground2 = ""
        let shadeColor2 = ""
        let playerId2 = sub?.playerId
        if (playerId2) {
            shadeBackground2 = await state.shadeBackgroundStyle(playerId2)
            shadeColor2 = await state.shadeColorStyle(playerId2)
        }
        let style2 = `${shadeBackground2}; ${shadeColor2};`
        return html`
<form
    $${when(!sub, () => `id="${id}"`)}
    $${when(sub && !player, () => `id="${subPlayerId}"`)}
    class="list m-0
${
() =>
    player && sub
        ? html`">${twoPlayerView(player, sub, isGameInPlay, queryTeamGame, id, subPlayerId, [style, style2])}`
    : player
        ? html`">${playerView(player, isGameInPlay, queryTeamGame, style, 1)}`
    : sub
        ? html`">${subPlayerView(sub, queryTeamGame, style)}`
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
        subPlayerId: string,
        style: string[]
) {
    return html`
<div id="${inPlayerId}">
${playerView(player, isGameInPlay, queryTeamGame, style[0], 2)}
</div>
<div id="${subPlayerId}">
${subPlayerView(sub, queryTeamGame, style[1])}
</div>`
}

function playerView(
        player: GamePlayerStatusView<InPlayPlayer>,
        isGameInPlay: boolean,
        queryTeamGame: string,
        style: string,
        numberOfPlayers: number
    ) {

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
        hf-swap="merge"
        hf-target="#app"
        >X</button>
</fieldset>
<div
    class="in-play-timer game-shader"
    style="$${style} $${when(numberOfPlayers > 1, 'border-bottom-right-radius: unset; border-bottom-left-radius: unset;')}"
    traits="game-timer"
    data-start="${player.calc.getLastStartTime()}"
    data-total="${player.calc.total()}"
    ${when(!isGameInPlay, "data-static")}>00:00</div>
`
}

function subPlayerView(
        sub: GamePlayerStatusView<OnDeckPlayer>,
        queryTeamGame: string,
        style: string
    ) {
    return html`
<fieldset class="mb-0" role="group">
    <button
        class="in-play-button"
        style="border-top-left-radius: unset;"
        formmethod=post
        formaction="/web/match?$${queryTeamGame}&playerId=${sub.playerId}&handler=swap"
        hf-swap="merge"
        hf-target="#app">(${sub.name})</button>
    <button
        class="in-play-button"
        style="border-top-right-radius: unset;"
        formmethod=post
        formaction="/web/match?$${queryTeamGame}&playerId=${sub.playerId}&handler=cancelOnDeck"
        hf-swap="merge"
        hf-target="#app"
        >X</button>
</fieldset>
<div
    class="in-play-timer game-shader"
    style="$${style} border-radius: 0 0 5px 5px;"
    traits="game-timer"
    data-start="${sub.calc.getLastStartTime()}"
    data-total="${sub.calc.total()}"
    data-static
    >00:00</div>
`
}