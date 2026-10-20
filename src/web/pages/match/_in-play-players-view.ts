import { GamePlayerStatusView, PlayerStateView, positionPlayersView } from "./shared.js";
import type { InPlayPlayer, OnDeckPlayer } from "../../server/db.js";

let {
  html,
  utils: { when },
} = self.sw;

// Each cell is a tap target for the selected player (see match-select.js);
// the player buttons inside it select that player.
export function inPlayersView(state: PlayerStateView) {
  return positionPlayersView(
    state,
    async ({ player, playerOnDeck, positionIndex, positionName }) => {
      let isGameInPlay = await state.isGameInPlay();
      let staleAfterMs = await state.staleAfterMs();
      let id = `in-player-${positionIndex}`;

      return player
        ? playerCard(player, playerOnDeck, isGameInPlay, id, positionIndex, staleAfterMs)
        : playerOnDeck
          ? html`
<div id="${id}" class="player-card is-queued" data-position="${positionIndex}">
    <span class=position-name>${positionName}</span>
    ${subButton(playerOnDeck, `${playerOnDeck.name} queued`)}
</div>`
          : html`<div id="${id}" class="player-card is-empty" data-position="${positionIndex}">${positionName}</div>`;
    },
    { gridItemWidth: "6.5em" },
  );
}

function playerCard(
  player: GamePlayerStatusView<InPlayPlayer>,
  sub: GamePlayerStatusView<OnDeckPlayer> | undefined,
  isGameInPlay: boolean,
  id: string,
  positionIndex: number,
  staleAfterMs: number | null,
) {
  return html`
<div id="${id}" class=player-card data-position="${positionIndex}">
    <button type=button class="player-main game-shader" data-player-id="${player.playerId}" data-status=inPlay>
        <span class=player-name>${player.name}</span>
        <span
            id="${id}-timer"
            class=player-time
            _load="gameTimer"
            data-start="${player.calc.getLastStartTime()}"
            data-total="${player.calc.total()}"
            data-game-total="${player.calc.gameCalc.total()}"
            $${when(isGameInPlay, () => `data-game-start="${player.calc.gameCalc.getLastStartTime()}"`)}
            $${when(staleAfterMs != null, () => `data-highlight-stale data-stale-after="${staleAfterMs}"`)}
            ${when(!isGameInPlay, "data-static")}>00:00</span>
        <span class=stint-bar></span>
    </button>
    ${when(sub, (x) => subButton(x, `↔ ${x.name} next`))}
</div>`;
}

function subButton(sub: GamePlayerStatusView<OnDeckPlayer>, label: string) {
  return html`<button type=button class=player-next data-player-id="${sub.playerId}" data-status=onDeck>${label}</button>`;
}
