import { GameTimeCalculator, PlayerStateView } from "./shared.js";
import { onDeckView } from "./_on-deck-view.js";
import { outPlayersView } from "./_out-player-view.js";
import { inPlayersView } from "./_in-play-players-view.js";
import { notPlayingPlayersView } from "./_not-playing-players-view.js";

let {
  html,
  repo: { statIds },
  utils: { when },
} = self.sw;

export default async function playMatchView(state: PlayerStateView) {
  let [
    isGameInPlay,
    inPlayPlayers,
    gameCalc,
    playersOnDeck,
    outPlayers,
    notPlayingPlayers,
    isGameEnded,
    isGamePaused,
    { stats },
    team,
  ] = await Promise.all([
    state.isGameInPlay(),
    state.inPlayPlayers(),
    state.gameCalc(),
    state.onDeckPlayers(),
    state.outPlayers(),
    state.notPlayingPlayers(),
    state.isGameEnded(),
    state.isGamePaused(),
    state.stats(),
    state.team(),
  ]);

  let queryTeamGame = state.queryTeamGame;

  let countOnDeckPlayersWithPosition = playersOnDeck.filter(
    (x) => x.status.targetPosition != null,
  ).length;
  let noPlayersExist = !inPlayPlayers.length && !countOnDeckPlayersWithPosition;
  let playersExist = !noPlayersExist;

  let countOnDeckWithNoPosition = playersOnDeck.filter(
    (x) => x.status.targetPosition == null,
  ).length;
  let points = gameCalc.gameState.points;
  // With the Goal stat on, tapping the score selects it and the next player
  // tapped gets the goal (match-select.js); otherwise it just adds a point.
  let creditScorer = stats.find((x) => x.id === statIds.Goal)?.active;

  return html`
<main id=main>
<header class=match-bar>
    <a class=match-back href="?${queryTeamGame}" target="_self" aria-label="Back to game">&lsaquo;</a>
    ${
      creditScorer
        ? html`<button type=button class=score data-status=score aria-label="Game points ${points}. Tap, then tap the scorer.">${points}</button>`
        : html`<button
        class=score
        form=post
        formaction="?${queryTeamGame}&handler=scorePoint"
        aria-label="Game points ${points}"
        >${points}</button>`
    }
    <span aria-hidden=true>&ndash;</span>
    ${opponentPointsView(queryTeamGame, gameCalc)}

    ${() => {
      let clock = html`<span id=gameTimer _load="gameTimer"
        $${when(isGamePaused, () => `data-flash data-start="${gameCalc.getLastEndTime()}"`)}
        $${when(isGameInPlay, `data-start="${gameCalc.getLastStartTime()}" data-total="${gameCalc.total()}"`)}
        $${when(isGameEnded, `data-static data-total="${gameCalc.total()}"`)}>00:00</span>`;
      // Tapping the clock starts or pauses the game.
      return isGameEnded
        ? html`<span class=match-clock>${clock}</span>`
        : html`
    <button
        id=gameStatus
        class=match-clock
        form=post
        formaction="?$${queryTeamGame}&handler=${isGameInPlay ? "pauseGame" : "startGame"}"
        aria-label="${isGameInPlay ? "Pause" : "Start"} the game"
        >${clock}<small>tap to ${isGameInPlay ? "pause" : "start"}</small></button>`;
    }}
    ${when(
      countOnDeckPlayersWithPosition > 0,
      () => html`
    <button
        class=swap-all
        form=post
        formaction="?$${queryTeamGame}&handler=swapAll"
        >Swap ${countOnDeckPlayersWithPosition}</button>`,
    )}
    <button
        type=button
        class="match-end bench-toggle"
        data-bench-toggle
        aria-controls=matchBench
        aria-expanded=true
        >Bench (${countOnDeckWithNoPosition + outPlayers.length})</button>
    <button
        class=match-end
        form=post
        formaction="?$${queryTeamGame}&handler=${isGameEnded ? "restartGame" : "endGame"}"
        _click="confirm"
        data-confirm="Are you sure you would like to ${isGameEnded ? "restart" : "end"} the game?" >
        ${isGameEnded ? "Restart" : "End"}
    </button>
</header>

<div class=match-body>
<section class=match-field aria-label="On field">${inPlayersView(state)}</section>

<aside id=matchBench class=match-bench>
    <div class=match-targets>
        <button type=button class=drop-target data-target=bench>Bench</button>
        <button type=button class=drop-target data-target=notPlaying>Not playing</button>
        <button type=button class="drop-target score-only" data-target=noScorer>No scorer</button>
        ${when(
          team.basketballMode,
          () => html`
            <div class="score-points score-only" role="radiogroup" aria-label="Points">
              <label><input type="radio" name="scorePoints" value="1" /> 1</label>
              <label><input type="radio" name="scorePoints" value="2" checked /> 2</label>
              <label><input type="radio" name="scorePoints" value="3" /> 3</label>
            </div>
          `,
        )}
    </div>
    <div class=match-bench-head>
        <h2>Bench (${countOnDeckWithNoPosition + outPlayers.length})</h2>
        ${when(
          playersExist,
          () => html`
        <button
            class="condense-padding match-end"
            form=post
            formaction="?$${queryTeamGame}&handler=allOut"
            _click="confirm"
            data-confirm="Are you sure you want to take all players out?"
            >All Out</button>`,
        )}
    </div>

    <div class=bench-scroll>
    <ul id=onDeckList class=bench-list>${onDeckView(state)}</ul>
    <ul id=outPlayersList class=bench-list>${outPlayersView(state)}</ul>

    ${when(
      notPlayingPlayers.length,
      () => html`
    <details>
        <summary>Not playing (${notPlayingPlayers.length})</summary>
        <ul id=notPlayingList class=bench-list>${notPlayingPlayersView(state)}</ul>
    </details>`,
    )}
    </div>
</aside>
</div>
</main>`;
}

export function opponentPointsView(queryTeamGame: string, gameCalc: GameTimeCalculator) {
  return html`<button
id=opponentPoints
class="score score-them"
form=post
formaction="?$${queryTeamGame}&handler=oPointsIncPlay"
aria-label="Opponent points ${gameCalc.gameState.opponentPoints}"
>${gameCalc.gameState.opponentPoints}</button>`;
}
