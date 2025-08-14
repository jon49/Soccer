import html from "html-template-tag-stream"
import { GamePlayerStatusView, PlayerStateView } from "./shared.js"
import { InPlayPlayer, OnDeckPlayer } from "../../server/db.js"

interface RenderArgs {
    title: string
    playerStateView: PlayerStateView
    playerView(options: {
        player: GamePlayerStatusView<InPlayPlayer> | undefined,
        playerOnDeck: GamePlayerStatusView<OnDeckPlayer> | undefined
        count: number
        position: string[]
    }): AsyncGenerator<any, void, unknown>
}

export async function playerPositionsView({ playerStateView, title, playerView }: RenderArgs) {
    let [inPlayPlayers, onDeckPlayers, { positions }] = await Promise.all([
        playerStateView.inPlayPlayers(),
        playerStateView.onDeckPlayers(),
        playerStateView.positions(),
    ])

    return html`
<dialog class=modal traits="x-dialog" show-modal>
    <article class="dialog-full-screen" style="--grid-item-width: 100px;">
        <header>
            <button form=modalClose aria-label="Close" value="cancel" rel="prev"></button>
            <h2>${title}</h2>
        </header>

${function* positionViews() {
    for (let position of positions) {
        let count = 0
        yield html`<div class="grid grid-center pb-1">`
        yield position.map((_) => {
            let player = inPlayPlayers.find(x => count === x.status.position)
            let playerOnDeck = onDeckPlayers.find(x => count === x.status.targetPosition)
            let row = playerView({player, playerOnDeck, count, position})
            count++
            return row
        })
        yield html`</div>`
    }
}}

<form hidden id=modalClose method=dialog></form>
</article>
</dialog>`

}

