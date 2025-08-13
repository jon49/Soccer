import html from "html-template-tag-stream"
import { GamePlayerStatusView, PlayerStateView } from "./shared.js"
import { InPlayPlayer, OnDeckPlayer } from "../../server/db.js"
import { when } from "@jon49/sw/utils.js"

function twoPlayerView(
        player: GamePlayerStatusView<InPlayPlayer>,
        sub: GamePlayerStatusView<OnDeckPlayer>,
        isGameInPlay: boolean,
        queryTeamGame: string
) {
    return html`
<ul class=list>
${playerView(player, isGameInPlay, queryTeamGame)}
${subPlayerView(sub, queryTeamGame)}
</ul>`
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
            hf-target="#player-state"
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
        hf-target="#player-state"
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
        hf-target="#player-state"
        >
        <button class=danger>X</button>
    </form>
</li>`
}

export default async function inPlayPlayersView(o: PlayerStateView) {
    let inPlay = await o.inPlayPlayers(),
        onDeck = await o.onDeckPlayers(),
        isGameInPlay = await o.isGameInPlay(),
        { positions } = await o.positions(),
        onDeckPlayers = await o.onDeckPlayers(),
        inPlayPlayers = await o.inPlayPlayers(),
        queryTeamGame = o.queryTeamGame,
        gameCalc = await o.gameCalc()

    return html`
${when(!inPlay && !onDeck, () => html`<p>No players are in play.</p>`)}
${when(inPlayPlayers.length || onDeckPlayers.length, function* positionViews() {
    let count = 0
    for (let xs of positions) {
        yield html`<div class="flex">`
        yield xs.map(() => {
            let player = inPlayPlayers.find(x => count === x.status.position)
            let sub = onDeckPlayers.find(x => x.status.targetPosition === count)
            let view = html`
            <div traits="game-shader"
                data-total="${gameCalc.currentTotal()}"
                data-value="${player?.calc.currentTotal()}">
            ${
            () => 
                player && sub
                    ? twoPlayerView(player, sub, isGameInPlay, queryTeamGame)
                : player
                    ? html`<ul class="list m-0">${playerView(player, isGameInPlay, queryTeamGame)}</ul>`
                : sub
                    ? html`<ul class="list m-0">${subPlayerView(sub, queryTeamGame)}</ul>`
                : html`<ul class="list empty m-0"><li></li><li></li><li></li></ul>`
            }</div>`
            count++
            return view
        })
        yield html`</div>`
    }
})}`
}
