import html from "html-template-tag-stream"
import { PlayerStateView } from "./shared.js"
import { inPlayPlayersView } from "./_in-play-players-view.js"
import { when } from "../../server/shared.js"
import { outPlayersView } from "./_out-player-view.js"

export async function playerStateView(o: PlayerStateView) {
    let { positions } = await o.positions()

    let inPlayPlayers = await o.inPlayPlayers()

    let onDeckPlayers = await o.onDeckPlayers()
    let onDeck = await o.playersOnDeck()

    let notPlayingPlayers = await o.notPlayingPlayers()
    let notPlaying = await o.playersNotPlaying()

    let queryTeamGame = o.queryTeamGame

    return html`
<h3>In-Play</h3>

<div id=in-play-players>
${inPlayPlayersView(o)}
</div>

${when(onDeck, () => html`
<h3>On Deck</h3>

<ul mpa-miss="#root" class=list>
    ${onDeckPlayers.map(x => {
        let currentPlayer = inPlayPlayers.find(y => y.playerId === x.status.currentPlayerId)
        return html`
    <li>
        <form method=post action="?$${queryTeamGame}&playerId=${x.playerId}&handler=swap">
            <button>Swap</button>
        </form>
        <form method=post action="?$${queryTeamGame}&playerId=${x.playerId}&handler=cancelOnDeck">
            <button class=danger>X</button>
        </form>
        <span>${x.name} - ${positions[x.status.targetPosition]}${when(currentPlayer, c => html` (${c.name})`)}</span>
    </li>
    `})}
</ul>`)}

${when(onDeckPlayers.length, () => html`
<form method=post action="?$${queryTeamGame}&handler=swapAll">
    <button>Swap All</button>
</form>`)}

<div id=out-players> ${outPlayersView(o)} </div>

${when(notPlaying, () => html`
<h3>Not Playing</h3>
<ul class=list>
    ${notPlayingPlayers.map(x => html`
    <li>
        <p>${x.name}</p>
        <form method=post action="?${queryTeamGame}&playerId=${x.playerId}&handler=backIn">
            <button>Back in</button>
        </form>
    </li>`)}
</ul>`)}
`
}
