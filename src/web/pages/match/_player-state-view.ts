import html from "html-template-tag-stream"
import { PlayerStateView } from "./shared.js"
import { outPlayersView } from "./_out-player-view.js"
import { when } from "@jon49/sw/utils.js"

export default async function playerStateView(o: PlayerStateView) {
    let notPlayingPlayers = await o.notPlayingPlayers()
    let notPlaying = await o.playersNotPlaying()
    let queryTeamGame = o.queryTeamGame

    return html`
<h3 class=inline>In-Play</h3>

<button
    hidden
    form=get-form
    formaction="/web/match?${queryTeamGame}&handler=showInPlay"

    hf-target="#dialogs"

    traits=x-subscribe
    data-event="loadInPlayPlayers"
    data-match="detail: true"
    >
</button>

<div>
    <button
        form=get-form
        formaction="/web/match?${queryTeamGame}&handler=showInPlay"
        hf-target="#dialogs"
        >Show Players</button>
</div>

<button
    hidden
    form=get-form
    formaction="/web/match?${queryTeamGame}&handler=reloadOutPlayersView"

    hf-target="#out-view"

    traits=x-subscribe
    data-event="updatedOutPlayers"
    data-match="detail: true"
    >
</button>
<div id=out-view>${outPlayersView(o)}</div>

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
