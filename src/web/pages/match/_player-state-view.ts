import html from "html-template-tag-stream"
import { inPlayTitle, PlayerStateView } from "./shared.js"
import { outPlayersView } from "./_out-player-view.js"
import { when } from "@jon49/sw/utils.js"

export default async function playerStateView(o: PlayerStateView) {
    let [
        notPlayingPlayers,
        countNotPlayingPlayers,
    ] = await Promise.all([
        o.notPlayingPlayers(),
        o.countNotPlayingPlayers(),
    ])
    let queryTeamGame = o.queryTeamGame

    return html`
<form
    hidden
    action="/web/match?${queryTeamGame}&handler=getInPlayTitle"

    hf-target="#in-play-title"

    traits=x-subscribe
    data-event="updatedOutPlayers"
    data-match="detail: true"></form>
<h3 id="in-play-title" class=inline>${inPlayTitle(o)}</h3>

<button
    hidden
    form=get-form
    formaction="/web/match?${queryTeamGame}&handler=showInPlay"

    hf-target="#dialogs"

    traits=x-subscribe
    data-event="inPlayersFilled"
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

${when(countNotPlayingPlayers, () => html`
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
