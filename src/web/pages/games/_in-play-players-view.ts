import html from "html-template-tag-stream"
import { PlayerStateView } from "./shared.js"
import { when } from "../../server/shared.js"

export async function inPlayPlayersView(o: PlayerStateView) {
    let inPlay = await o.inPlayPlayers(),
        isGameInPlay = await o.isGameInPlay(),
        { grid, positions } = await o.positions(),
        onDeckPlayers = await o.onDeckPlayers(),
        inPlayPlayers = await o.inPlayPlayers(),
        queryTeamGame = o.queryTeamGame,
        gameCalc = await o.gameCalc()

    return html`
${when(!inPlay, () => html`<p>No players are in play.</p>`)}
${when(inPlayPlayers.length, function* positionViews() {
    let count = 0
    for (let width of grid) {
        yield html`<div class="row grid-center">`
        let p = positions.slice(count, count + width)
        if (p.length < width) {
            p = p.concat(new Array(width - p.length).fill("None"))
        }
        yield p.map(() => {
            let player = inPlayPlayers.find(x => count === x.status.position)
            let sub = player && onDeckPlayers.find(x => x.status.currentPlayerId === player?.playerId)
            let view = html`<form method=post>${
            () => {
                return player
                    ? html`
                <game-shader data-total="${gameCalc.currentTotal()}" data-value="${player.calc.currentTotal()}">
                    <div>
                        ${when(sub, sub => html`<span>${player?.name} (${sub.name})</span>`)}
                        ${when(!sub, () => html`<a href="?$${queryTeamGame}&playerId=${player?.playerId}&handler=placePlayerOnDeck&playerSwap#game-swap-top">${player?.name}</a>`)}
                        <game-timer data-start="${player.calc.getLastStartTime()}" data-total="${player.calc.total()}" ${when(!isGameInPlay, "data-static")}></game-timer>
                        <button formaction="?${queryTeamGame}&playerId=${player.playerId}&handler=playerNowOut">X</button>
                    </div>
                </game-shader>
                    `
                : html`<span></span>`
            }
            }</form>`
            count++
            return view
        })
        yield html`</div>`
    }
})}`
}
