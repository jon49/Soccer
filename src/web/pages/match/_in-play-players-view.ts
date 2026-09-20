import { GamePlayerStatusView, PlayerStateView, positionPlayersView } from "./shared.js";
import type { InPlayPlayer, OnDeckPlayer } from "../../server/db.js";

let {
  html,
  utils: { when },
} = self.sw;

export function inPlayersView(state: PlayerStateView) {
  return positionPlayersView(
    state,
    async ({ player, playerOnDeck, positionIndex }) => {
      let isGameInPlay = await state.isGameInPlay();
      let staleAfterMs = await state.staleAfterMs();
      let sub = playerOnDeck;
      let queryTeamGame = state.queryTeamGame;
      let id = `in-player-${positionIndex}`;
      let subPlayerId = `sub-player-${positionIndex}`;

      return html`
<form
    method=post
    $${when(!sub, () => `id="${id}"`)}
    $${when(sub && !player, () => `id="${subPlayerId}"`)}
    class="list m-0
${() =>
  player && sub
    ? html`">${twoPlayerView(player, sub, isGameInPlay, queryTeamGame, id, subPlayerId, staleAfterMs)}`
    : player
      ? html`">${playerView(player, isGameInPlay, queryTeamGame, 1, id, staleAfterMs)}`
      : sub
        ? html`">${subPlayerView(sub, isGameInPlay, queryTeamGame, subPlayerId)}`
        : html`
            empty">
          `}</form>`;
    },
    { gridItemWidth: "8em" },
  );
}

function twoPlayerView(
  player: GamePlayerStatusView<InPlayPlayer>,
  sub: GamePlayerStatusView<OnDeckPlayer>,
  isGameInPlay: boolean,
  queryTeamGame: string,
  inPlayerId: string,
  subPlayerId: string,
  staleAfterMs: number | null,
) {
  return html`
<div id="${inPlayerId}">
${playerView(player, isGameInPlay, queryTeamGame, 2, inPlayerId, staleAfterMs)}
</div>
<div id="${subPlayerId}">
${subPlayerView(sub, isGameInPlay, queryTeamGame, subPlayerId)}
</div>`;
}

function playerView(
  player: GamePlayerStatusView<InPlayPlayer>,
  isGameInPlay: boolean,
  queryTeamGame: string,
  numberOfPlayers: number,
  containerId: string,
  staleAfterMs: number | null,
) {
  return html`
<fieldset class="mb-0" role="group">
    <a class="in-play-button"
       href="?$${queryTeamGame}&playerId=${player?.playerId}&handler=playerSwap"
       role="button"
       >${player?.name}</a>
    <button
        class="in-play-button"
        formaction="?${queryTeamGame}&playerId=${player.playerId}&handler=playerNowOut"
        >X</button>
</fieldset>
<div
    id="${containerId}-timer"
    class="in-play-timer game-shader game-timer"
    $${when(numberOfPlayers > 1, () => `style="border-bottom-right-radius: unset; border-bottom-left-radius: unset;"`)}
    _load="gameTimer"
    data-start="${player.calc.getLastStartTime()}"
    data-total="${player.calc.total()}"
    data-game-total="${player.calc.gameCalc.total()}"
    $${when(isGameInPlay, () => `data-game-start="${player.calc.gameCalc.getLastStartTime()}"`)}
    $${when(staleAfterMs != null, () => `data-highlight-stale data-stale-after="${staleAfterMs}"`)}
    ${when(!isGameInPlay, "data-static")}>00:00</div>
`;
}

function subPlayerView(
  sub: GamePlayerStatusView<OnDeckPlayer>,
  isGameInPlay: boolean,
  queryTeamGame: string,
  containerId: string,
) {
  return html`
<fieldset class="mb-0" role="group">
    <button
        class="in-play-button"
        style="border-top-left-radius: unset;"
        formaction="?$${queryTeamGame}&playerId=${sub.playerId}&handler=swap"
        >(${sub.name})</button>
    <button
        class="in-play-button"
        style="border-top-right-radius: unset;"
        formaction="?$${queryTeamGame}&playerId=${sub.playerId}&handler=cancelOnDeck"
        >X</button>
</fieldset>
<div
    id="${containerId}-timer"
    class="in-play-timer game-shader game-timer"
    style="border-radius: 0 0 5px 5px;"
    _load="gameTimer"
    data-start="${sub.calc.getLastStartTime()}"
    data-total="${sub.calc.total()}"
    data-game-total="${sub.calc.gameCalc.total()}"
    $${when(isGameInPlay, () => `data-game-start="${sub.calc.gameCalc.getLastStartTime()}"`)}
    data-static
    >00:00</div>
`;
}
