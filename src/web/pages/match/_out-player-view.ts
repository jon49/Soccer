import type { PlayerStateView } from "./shared.js"

let {
    html,
} = self.sw

export async function outPlayersView(o: PlayerStateView) {
    let outPlayers = await o.outPlayers()
    let queryTeamGame = o.queryTeamGame

    return html`
    ${outPlayers.map(x => {

    let outPlayerId = `outPlayer${x.playerId}`

    return html`
<li id="${outPlayerId}">
    <div>
        <a href="?${queryTeamGame}&playerId=${x.playerId}&handler=playerSwap"
           aria-label="Immediately Swap Player"
           title="Immediately Swap Player"
           role="button">&#10166;</a>
    </div>
    <div>
        <button
            form=post
            formaction="?$${queryTeamGame}&playerId=${x.playerId}&handler=playerOnDeck"
            _click="anchor"
            data-anchor="#outPlayers"
        >${x.name} ${x.number}</button>
    </div>
    <div>
        <span _load="gameTimer" data-total="${x.calc.total()}" data-static>00:00</span>
    </div>
    <div>
        <button
            form=post
            formaction="?$${queryTeamGame}&playerId=$${x.playerId}&handler=notPlaying"
        >X</button>
    </div>
</li>`
})}`
}
