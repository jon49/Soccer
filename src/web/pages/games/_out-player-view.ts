import html from "html-template-tag-stream"
import { PlayerStateView } from "./shared.js"

export async function outPlayersView(o: PlayerStateView) {
    let out = await o.playersOut()
    if (!out) return html``

    let outPlayers = await o.outPlayers()
    let queryTeamGame = o.queryTeamGame

    return html`
<h3>Out</h3>

<ul id=out-players class=list mpa-miss="#out-players">

    ${outPlayers.map(x => html`
<li>
    <form method=post action="?$${queryTeamGame}&playerId=$${x.playerId}&handler=notPlaying">
        <button>X</button>
    </form>
    <a href="?$${queryTeamGame}&playerId=${x.playerId}&handler=placePlayerOnDeck&playerSwap#game-swap-top">${x.name}</a>
    <game-timer data-total="${x.calc.total()}" data-static></game-timer>
</li>`)}

</ul>`
}
