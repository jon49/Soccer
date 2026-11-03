import { PlayerStateView } from "./shared.js";
import { gameStatusText } from "./match-page-logic.js";

let {
  html,
  utils: { formatGameDate, formatGameTime, when },
} = self.sw;

export default async function render(query: any) {
  let state = await PlayerStateView.create(query),
    [notes, game, gameState, team, gameCalc] = await Promise.all([
      state.notes(),
      state.game(),
      state.gameState(),
      state.team(),
      state.gameCalc(),
    ]),
    queryTeamGame = state.queryTeamGame;

  return html`
<h2 class=game-title>${team.name} vs ${game.opponent}</h2>
<p class=game-details>
    <span>${formatGameDate(game.date)}</span>
    ${when(game.time, (time) => html`<span>${formatGameTime(time)}</span>`)}
    <span>${game.home ? "Home" : "Away"}</span>
    ${when(game.location, (location) => html`<span>${location}</span>`)}
    <span class=badge>${gameStatusText(gameState.status, gameCalc.total())}</span>
</p>

<p>
    <a href="?${queryTeamGame}&handler=play" role=button class="nc-button button-large" target="_self">Open match</a>
</p>

<ul class=list>
    <li><span>Points</span><span>${gameState.points}</span></li>
    <li><span>Opponent</span><span>${gameState.opponentPoints}</span></li>
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
