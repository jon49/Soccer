import { PlayerStateView } from "./shared.js";

let { html } = self.sw;

export function getPointsView(points: number) {
  return html`${points || "0"}`;
}

export default async function render(query: any) {
  let state = await PlayerStateView.create(query),
    [notes, game, gameState, team] = await Promise.all([
      state.notes(),
      state.game(),
      state.gameState(),
      state.team(),
    ]),
    queryTeamGame = state.queryTeamGame;

  let pointAction = `?${queryTeamGame}&activityId=1&handler=points`;
  let opponentPointAction = `?${queryTeamGame}&handler=oPoints`;

  return html`
<h2>${team.name} ($${game.home ? "Home" : "Away"}) vs ${game.opponent}</h2>

<p>
    <a href="?${queryTeamGame}&handler=play" role=button class="nc-button button-large" target="_self">Open match</a>
</p>

<ul class=list>
    <li>
        <span>Points</span>
        <form method="post">
            <button class=condense-padding formaction="$${pointAction}&action=dec">-</button>
            <span id=points>${getPointsView(gameState.points)}</span>
            <button class=condense-padding formaction="$${pointAction}&action=inc">+</button>
        </form>
    </li>

    <li>
        <span>Opponent</span>
        <form method="post">
            <button class=condense-padding formaction="${opponentPointAction}Dec">-</button>
            <span id=o-points>${getPointsView(gameState.opponentPoints)}</span>
            <button class=condense-padding formaction="${opponentPointAction}Inc">+</button>
        </form>
    </li>
</ul>

<h3>Notes</h3>

<form
    method=post
    action="?${queryTeamGame}&handler=updateNote"
    _change=submit>
    <textarea name=notes>${notes}</textarea>
</form>

<section class=danger-zone>
    <h3>Delete game</h3>
    <p>Removes the game from the schedule, along with its score and every player's time and stats for it.</p>
    <button
        class=danger
        form=post
        formaction="?${queryTeamGame}&handler=deleteGame"
        data-confirm="Are you sure you would like to delete this game?"
        _click="confirm"
        >Delete game</button>
</section>
`;
}
