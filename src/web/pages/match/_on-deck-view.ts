import type { PlayerStateView } from "./shared.js";

let {
  html,
  utils: { when },
} = self.sw;

export async function onDeckView(state: PlayerStateView) {
  let playersOnDeck = await state.onDeckPlayers();
  let onDeckWithoutPosition = playersOnDeck.filter((x) => x.status.targetPosition == null);

  return onDeckWithoutPosition.map((x) => {
    let id = `on-deck-${x.playerId}`;
    return html`
<li id="${id}">
    <button type=button class=bench-item data-player-id="${x.playerId}" data-status=onDeck>
        <span class=player-name>${x.name}${when(x.number, (x) => ` ${x}`)}</span>
        <span class=tag>on deck</span>
    </button>
</li>`;
  });
}
