import html from "html-template-tag-stream"
import { PlayerStateView } from "./shared.js"

export default async function playerStateView(o: PlayerStateView) {
    let queryTeamGame = o.queryTeamGame

    return html`
<form
    hidden
    action="/web/match?${queryTeamGame}&handler=showInPlay"
    hf-target="#dialogs"
    traits=x-on
    data-event="inPlayersFilled"></form>

<form
    traits="x-on"
    data-event="updatedOutPlayers"
    action="/web/match?${queryTeamGame}&handler=outPlayersList"
    hf-target="#out-players-view"></form>

<form
    traits="x-on"
    data-event="updatedNotPlayingPlayers"
    action="/web/match?${queryTeamGame}&handler=notPlayingPlayersList"
    hf-target="#notPlayingList"></form>

<div>
    <button
        form=get-form
        formaction="/web/match?${queryTeamGame}&handler=showInPlay"
        hf-target="#dialogs"
        >Show Game Play View</button>
</div>

`
}
