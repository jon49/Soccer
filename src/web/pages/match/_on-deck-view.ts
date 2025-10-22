import type { PlayerStateView } from "./shared.js"

let {
    html,
    utils: { when }
} = self.sw

export async function onDeckView(state: PlayerStateView) {
    let playersOnDeck = await state.onDeckPlayers()
    let onDeckWithoutPosition = playersOnDeck.filter(x => x.status.targetPosition == null)
    let queryTeamGame = state.queryTeamGame

    return onDeckWithoutPosition.map(x => {
        let id = `on-deck-${x.playerId}`
        return html`
<li id="${id}">
    <div>
        <a href="?${queryTeamGame}&playerId=${x.playerId}&handler=playerSwap" target=htmz role=button>(${x.name}${when(x.number, x => ` ${x}`)})</a>
    </div>
    <form
        method=post
        action="?${queryTeamGame}&playerId=${x.playerId}&handler=cancelOnDeck"
        target=htmz
        data-action=anchor
        data-anchor="#onDeck"
        >
        <button>X</button>
    </form>
</li>`
    })
}
