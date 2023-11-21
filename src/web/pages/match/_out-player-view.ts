import html from "html-template-tag-stream"
import { PlayerStateView } from "./shared.js"

export async function outPlayersView(o: PlayerStateView) {
    let out = await o.playersOut()
    if (!out) return html``

    let outPlayers = await o.outPlayers()
    let queryTeamGame = o.queryTeamGame

    return html`
<h3 id=out-players>Out</h3>

<ul class=list>

    ${outPlayers.map(x => html`
<li>
    <form
        method=post
        action="/web/match?$${queryTeamGame}&playerId=$${x.playerId}&handler=notPlaying"
        hf-target="#player-state"
        >
        <button>X</button>
    </form>
    <form
        action="/web/match?$${queryTeamGame}&playerId=${x.playerId}&handler=playerSwap"
        hf-target="#dialogs" >
        <button>${x.name}</button>
    </form>
    <game-timer data-total="${x.calc.total()}" data-static></game-timer>
</li>`)}

</ul>`
}
