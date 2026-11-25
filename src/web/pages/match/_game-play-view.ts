import { PlayerStateView } from "./shared.js";
import { gameStatusText } from "./match-page-logic.js";
import html from "html-template-tag-stream";
import { formatGameDate, formatGameTime, when } from "../../data/utils.js";
import { helpView, setupGuideView } from "../_help-views.js";

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
    <a href="?${queryTeamGame}&handler=play" role=button class="nc-button button-large">Open match</a>
</p>

${setupGuideView(team, "play")}

${helpView(
  html`
    <p>
      <strong>Open match</strong> is the screen you use during the game: it shows the field and the
      bench, runs the clock, and keeps the score. It also has its own help: the ? after End.
    </p>
    <p>
      The score below comes from the match. <strong>Notes</strong> save as you type, for anything you
      want to remember about the game.
    </p>
  `,
)}

<ul class=list>
    <li><span>Points</span><span>${gameState.points}</span></li>
    <li><span>Opponent</span><span>${gameState.opponentPoints}</span></li>
</ul>

<h3>Notes</h3>

<form _change=updateNote>
    <textarea name=notes>${notes}</textarea>
</form>

<section class=danger-zone>
    <h3>Delete game</h3>
    <p>Removes the game from the schedule, along with its score and every player's time and stats for it.</p>
    <button
        type=button
        class=danger
        data-confirm="Are you sure you would like to delete this game?"
        _click="confirm deleteGame"
        >Delete game</button>
</section>
`;
}
