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
    }, { gridItemWidth: "15em" })
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