import { PlayerStateView } from "./shared.js"

let {
    html,
} = self.sw

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

        let pointAction = `?${queryTeamGame}&activityId=1&handler=points`
        let opponentPointAction = `?${queryTeamGame}&handler=oPoints`

    return html`
<h2 class=inline>${team.name} ($${game.home ? "Home" : "Away"}) vs ${game.opponent}</h2>
<button
    class=condense-padding
    form=post
    formaction="?${queryTeamGame}&handler=deleteGame"
    data-confirm="Are you sure you would like to delete this game?"
    data-action="confirm"
    >Delete</button>

<br>
<br>

<ul class=list>
    <li>
        <span>Points</span>
        <form method="post">
            <button class=condense-padding formaction="$${pointAction}&action=dec">-</button>
            <span id=points>${getPointsView(game.points)}</span>
            <button class=condense-padding formaction="$${pointAction}&action=inc">+</button>
        </form>
    </li>

    <li>
        <span>Opponent</span>
        <form method="post">
            <button class=condense-padding formaction="${opponentPointAction}Dec">-</button>
            <span id=o-points>${getPointsView(game.opponentPoints)}</span>
            <button class=condense-padding formaction="${opponentPointAction}Inc">+</button>
        </form>
    </li>
</ul>

<div>
    <a href="?${queryTeamGame}&handler=play" target="_self" data-action="defaultTheme">Show Game Play View</a>
</div>

<h3>Notes</h3>

<form
    method=post
    action="?${queryTeamGame}&handler=updateNote"
    data-action=submit>
    <textarea name=notes>${notes}</textarea>
</form>
`
}
