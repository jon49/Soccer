import html from "html-template-tag-stream"
import { PlayerStateView } from "./shared.js"

export async function onDeckView(state: PlayerStateView) {
    let playersOnDeck = await state.onDeckPlayers()
    let onDeckWithoutPosition = playersOnDeck.filter(x => x.status.targetPosition == null)
    let queryTeamGame = state.queryTeamGame

    return onDeckWithoutPosition.map(x => {
        let id = `on-deck-${x.playerId}`
        return html`
<li id="${id}">
    <form
        action="/web/match?${queryTeamGame}&playerId=${x.playerId}&handler=playerSwap"
        hf-target="#dialogs">
        <button>(${x.name})</button>
    </form>
    <form
        method=post
        action="/web/match?${queryTeamGame}&playerId=${x.playerId}&handler=cancelOnDeck"
        hf-target="#${id}"
        hf-swap="outerHTML"
        >
        <button>X</button>
    </form>
</li>`
    })
}
