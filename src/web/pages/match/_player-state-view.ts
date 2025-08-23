import { PlayerStateView } from "./shared.js"

let {
    html,
} = self.app

export default async function playerStateView(o: PlayerStateView) {
    let queryTeamGame = o.queryTeamGame

    return html`
<form
    hidden
    action="/web/match?${queryTeamGame}&handler=showInPlay"
    hf-target="#dialogs"
    traits=on
    data-events="inPlayersFilled"></form>

<form
    traits="on"
    data-events="updatedOnDeckPlayers"
    action="/web/match?${queryTeamGame}&handler=onDeckList"
    hf-target="#onDeckList"
    ></form>

<form
    traits="on"
    data-events="updatedOutPlayers"
    action="/web/match?${queryTeamGame}&handler=outPlayersList"
    hf-target="#outPlayersList"></form>

<form
    traits="on"
    data-events="updatedNotPlayingPlayers"
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
