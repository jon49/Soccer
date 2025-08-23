import html from "html-template-tag-stream";
import { PlayerStateView } from "./shared.js";

export async function notPlayingPlayersView(state: PlayerStateView) {
    let [
        notPlayingPlayers,
    ] = await Promise.all([
        state.notPlayingPlayers(),
    ])

    return notPlayingPlayers.map(x => {
        let id = `not-playing-${x.playerId}`
        return html`
<li id="${id}">
    <form
        method=post
        action="/web/match?${state.queryTeamGame}&playerId=${x.playerId}&handler=backIn"
        hf-target="#${id}"
        hf-swap="outerHTML"
        aria-label="Place ${x.name} back into the game."
        >
        <button>${x.name}</button>
    </form>
</li>`})

}
