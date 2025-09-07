import { PlayerStateView } from "./shared.js"
import playerStateView from "./_player-state-view.js"

let {
    html,
} = self.app

export function getPointsView(points: number) {
    return html`${points || "0"}`
}

export default async function render(query: any) {
    let state = await PlayerStateView.create(query),
        [
            notes,
            game,
            team,
        ] = await Promise.all([
            state.notes(),
            state.game(),
            state.team(),
        ]),
        queryTeamGame = state.queryTeamGame

        let pointAction = `/web/match?${queryTeamGame}&activityId=1&handler=points`
        let opponentPointAction = `/web/match?${queryTeamGame}&handler=oPoints`

    return html`
<h2>${team.name} ($${game.home ? "Home" : "Away"}) vs ${game.opponent}</h2>

<div class="pb-1">

<ul class=list>
    <li>

        <span>Points</span>
        <form method="post" hf-target="#points">
            <button class=condense-padding formaction="$${pointAction}&action=dec">-</button>
            <span id=points>${getPointsView(game.points)}</span>
            <button class=condense-padding formaction="$${pointAction}&action=inc">+</button>
        </form>

    </li>
    <li>
        <span>Opponent</span>

        <form method="post" hf-target="#o-points">
            <button class=condense-padding formaction="${opponentPointAction}Dec">-</button>
            <span id=o-points>${getPointsView(game.opponentPoints)}</span>
            <button class=condense-padding formaction="${opponentPointAction}Inc">+</button>
        </form>
    </li>
</ul>

<div id="player-state">${playerStateView(state)}</div>

<h3>Notes</h3>

<form method=post action="/web/match?${queryTeamGame}&handler=updateNote" onchange="this.requestSubmit()">
    <elastic-textarea>
        <textarea name=notes>${notes}</textarea>
    </elastic-textarea>
</form>
`
}
