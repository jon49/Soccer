import type { PlayerStateView } from "./shared.js";

let {
  html,
  utils: { when },
} = self.sw;

export async function outPlayersView(o: PlayerStateView) {
  let [outPlayers, isGameInPlay, fairShareAttrs] = await Promise.all([
    o.outPlayers(),
    o.isGameInPlay(),
    o.fairShareAttrs(),
  ]);

  return html`
    ${outPlayers.map((x) => {
      let outPlayerId = `outPlayer${x.playerId}`;

      return html`
<li id="${outPlayerId}">
    <button type=button class="bench-item game-shader" data-player-id="${x.playerId}" data-status=out>
        <span class=player-name>${x.name} ${x.number}</span>
        <span class=bench-times>
            <span
                id="${outPlayerId}-timer"
                class=player-time
                _load="gameTimer"
                data-total="${x.calc.total()}"
                data-game-total="${x.calc.gameCalc.total()}"
                $${when(isGameInPlay, () => `data-game-start="${x.calc.gameCalc.getLastStartTime()}"`)}
                $${fairShareAttrs}
                data-static>00:00</span>
            <span
                id="${outPlayerId}-fair"
                class=fair-delta
                _load="fairShareDelta"
                data-total="${x.calc.total()}"
                data-game-total="${x.calc.gameCalc.total()}"
                $${when(isGameInPlay, () => `data-game-start="${x.calc.gameCalc.getLastStartTime()}"`)}
                $${fairShareAttrs}></span>
        </span>
    </button>
</li>`;
    })}`;
}
