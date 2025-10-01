import type { PlayerStateView } from "./shared.js";

let {
    html,
} = self.app

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
        action="?${state.queryTeamGame}&playerId=${x.playerId}&handler=backIn"
        hf-target="#app"
        hf-swap="merge"
        aria-label="Place ${x.name} back into the game."
        >
        <button>${x.name} ${x.number}</button>
    </form>
</li>`})

}
