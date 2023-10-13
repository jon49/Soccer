import html from "html-template-tag-stream"
import { GamePlayerStatusView, PlayerStateView } from "./shared.js"
import { when } from "../../server/shared.js"
import { InPlayPlayer, OnDeckPlayer } from "../../server/db.js"

function twoPlayerView(
        player: GamePlayerStatusView<InPlayPlayer>,
        sub: GamePlayerStatusView<OnDeckPlayer>,
        isGameInPlay: boolean,
        queryTeamGame: string
) {
    return html`
<details>
    <summary>${player.name} (${sub.name})</summary>
    <ul class=list>
    ${playerView(player, isGameInPlay, queryTeamGame)}
    ${subPlayerView(sub, queryTeamGame)}
    </ul>
</details>`
}

function playerView(
        player: GamePlayerStatusView<InPlayPlayer>,
        isGameInPlay: boolean,
        queryTeamGame: string) {
    return html`
    <li>
        <a href="?$${queryTeamGame}&playerId=${player?.playerId}&handler=placePlayerOnDeck&playerSwap#game-swap-top">${player?.name}</a>
        <game-timer
            data-start="${player.calc.getLastStartTime()}"
            data-total="${player.calc.total()}"
            ${when(!isGameInPlay, "data-static")}></game-timer>
        <form
            method=post
            action="?${queryTeamGame}&playerId=${player.playerId}&handler=playerNowOut"
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
        action="?$${queryTeamGame}&playerId=${sub.playerId}&handler=swap"
        hf-target="#player-state"
        >
        <button>(${sub.name})</button>
    </form>
    <game-timer
        data-start="${sub.calc.getLastStartTime()}"
        data-total="${sub.calc.total()}"
        data-static></game-timer>
    <form
        method=post
        action="?$${queryTeamGame}&playerId=${sub.playerId}&handler=cancelOnDeck"
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
        { grid, positions } = await o.positions(),
        onDeckPlayers = await o.onDeckPlayers(),
        inPlayPlayers = await o.inPlayPlayers(),
        queryTeamGame = o.queryTeamGame,
        gameCalc = await o.gameCalc()

    return html`
${when(!inPlay && !onDeck, () => html`<p>No players are in play.</p>`)}
${when(inPlayPlayers.length || onDeckPlayers.length, function* positionViews() {
    let count = 0
    for (let width of grid) {
        yield html`<div class="row grid-center">`
        let p = positions.slice(count, count + width)
        if (p.length < width) {
            p = p.concat(new Array(width - p.length).fill("None"))
        }
        yield p.map(() => {
            let player = inPlayPlayers.find(x => count === x.status.position)
            let sub = onDeckPlayers.find(x => x.status.targetPosition === count)
            let view = html`
            <game-shader
                data-total="${gameCalc.currentTotal()}"
                data-value="${player?.calc.currentTotal()}">
            ${
            () => 
                player && sub
                    ? twoPlayerView(player, sub, isGameInPlay, queryTeamGame)
                : player
                    ? html`<ul class=list>${playerView(player, isGameInPlay, queryTeamGame)}</ul>`
                : sub
                    ? html`<ul class=list>${subPlayerView(sub, queryTeamGame)}</ul>`
                : null
            }</game-shader>`
            count++
            return view
        })
        yield html`</div>`
    }
})}`
}
