import type { PlayerStateView } from "./shared.js"

let {
    html,
} = self.app

export async function outPlayersView(o: PlayerStateView) {
    let outPlayers = await o.outPlayers()
    let queryTeamGame = o.queryTeamGame

    return html`
<form id="out-players-form" method=post hf-swap=outerHTML></form>

    ${outPlayers.map(x => {

    let outPlayerId = `out-player-${x.playerId}`

    return html`
<li id="${outPlayerId}">
    <div>
        <button
            form="out-players-form"
            formaction="/web/match?$${queryTeamGame}&playerId=${x.playerId}&handler=playerOnDeck"
            hf-target="#${outPlayerId}"
        >${x.name}</button>
    </div>
    <div>
        <span traits="game-timer" data-total="${x.calc.total()}" data-static>00:00</span>
    </div>
    <div>
        <button
            form="out-players-form"
            formaction="/web/match?$${queryTeamGame}&playerId=$${x.playerId}&handler=notPlaying"
            hf-target="#${outPlayerId}"
        >X</button>
    </div>
</li>`
})}`
}
