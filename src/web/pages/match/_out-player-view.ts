import type { PlayerStateView } from "./shared.js"

let {
    html,
} = self.app

export async function outPlayersView(o: PlayerStateView) {
    let outPlayers = await o.outPlayers()
    let queryTeamGame = o.queryTeamGame

    return html`
<form id="out-players-form" method=post hf-swap="merge" hf-target="#app"></form>

    ${outPlayers.map(x => {

    let outPlayerId = `out-player-${x.playerId}`

    return html`
<li id="${outPlayerId}">
    <form action="/web/match?${queryTeamGame}&playerId=${x.playerId}&handler=playerSwap" hf-target="#app">
        <button aria-label="Immediately Swap Player" title="Immediately Swap Player">&#10166;</button>
    </form>
    <div>
        <button
            form="out-players-form"
            formaction="/web/match?$${queryTeamGame}&playerId=${x.playerId}&handler=playerOnDeck"
        >${x.name} ${x.number}</button>
    </div>
    <div>
        <span traits="game-timer" data-total="${x.calc.total()}" data-static>00:00</span>
    </div>
    <div>
        <button
            form="out-players-form"
            formaction="/web/match?$${queryTeamGame}&playerId=$${x.playerId}&handler=notPlaying"
        >X</button>
    </div>
</li>`
})}`
}
