import type { PlayerStateView } from "./shared.js";

let {
  html,
  utils: { when },
} = self.sw;

// Styled like bench players; tapping one puts them back on the bench.
export async function notPlayingPlayersView(state: PlayerStateView) {
  let [notPlayingPlayers, isGameInPlay] = await Promise.all([
    state.notPlayingPlayers(),
    state.isGameInPlay(),
  ]);

  return notPlayingPlayers.map((x) => {
    let id = `not-playing-${x.playerId}`;
    return html`
<li id="${id}">
    <button
        class="bench-item game-shader"
        form=post
        formaction="?${state.queryTeamGame}&playerId=${x.playerId}&handler=backIn"
        aria-label="Place ${x.name} back on the bench."
        >
        <span class=player-name>${x.name} ${x.number}</span>
        <span
            id="${id}-timer"
            class=player-time
            _load="gameTimer"
            data-total="${x.calc.total()}"
            data-game-total="${x.calc.gameCalc.total()}"
            $${when(isGameInPlay, () => `data-game-start="${x.calc.gameCalc.getLastStartTime()}"`)}
            data-static>00:00</span>
    </button>
</li>`;
  });
}
