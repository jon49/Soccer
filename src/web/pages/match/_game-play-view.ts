import { PlayerStateView } from "./shared.js"

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
<h2 class=inline>${team.name} ($${game.home ? "Home" : "Away"}) vs ${game.opponent}</h2>
<button
    class=condense-padding
    form=post
    formaction="/web/match?${queryTeamGame}&handler=deleteGame"
    hf-confirm="Are you sure you would like to delete this game?"
    >Delete</button>

<br>
<br>

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

<div>
    <a href="/web/match?${queryTeamGame}&handler=play">Show Game Play View</a>
</div>

<h3>Notes</h3>

<form
    method=post
    action="?${queryTeamGame}&handler=updateNote"
    onchange="this.requestSubmit()"
    hf
    >
    <textarea name=notes>${notes}</textarea>
</form>
`
}
