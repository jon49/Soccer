import { PlayerStateView } from "./shared.js"

let {
    html,
} = self.app

export default async function playerStateView(o: PlayerStateView) {
    let queryTeamGame = o.queryTeamGame

    return html`
<div>
    <a href="/web/match?${queryTeamGame}&handler=play">Show Game Play View</a>
</div>

`
}
