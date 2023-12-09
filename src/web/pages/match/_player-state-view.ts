import html from "html-template-tag-stream"
import { PlayerStateView } from "./shared.js"
import inPlayPlayersView from "./_in-play-players-view.js"
import { outPlayersView } from "./_out-player-view.js"
import { when } from "@jon49/sw/utils.js"

export default async function playerStateView(o: PlayerStateView) {
    let onDeckPlayers = await o.onDeckPlayers()
    let notPlayingPlayers = await o.notPlayingPlayers()
    let notPlaying = await o.playersNotPlaying()
    let queryTeamGame = o.queryTeamGame

    return html`
<h3 class=inline>In-Play</h3>
${when(onDeckPlayers.length, () => html`
<form
    class=inline
    method=post
    action="/web/match?$${queryTeamGame}&handler=swapAll"
    hf-target="#player-state"
    >
    <button>Swap All</button>
</form>`)}

<div id=in-play-players> ${inPlayPlayersView(o)} </div>

<div> ${outPlayersView(o)} </div>

${when(notPlaying, () => html`
<h3>Not Playing</h3>
<ul class=list>
    ${notPlayingPlayers.map(x => html`
    <li>
        <p>${x.name}</p>
        <form
            method=post
            action="/web/match?${queryTeamGame}&playerId=${x.playerId}&handler=backIn"
            hf-target="#player-state"
            >
            <button>Back in</button>
        </form>
    </li>`)}
</ul>`)}
`
}
