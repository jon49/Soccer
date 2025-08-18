import html from "html-template-tag-stream"
import { GamePlayerStatusView, PlayerStateView } from "./shared.js"
import { InPlayPlayer, OnDeckPlayer } from "../../server/db.js"
import { when } from "@jon49/sw/utils.js"

interface RenderArgs {
    slot?: AsyncGenerator<any, void, unknown> | undefined | null
    keepOpen?: boolean
    title: string | AsyncGenerator<any, void, unknown>
    playerStateView: PlayerStateView
    playerView(options: {
        rowIndex: number
        player: GamePlayerStatusView<InPlayPlayer> | undefined,
        playerOnDeck: GamePlayerStatusView<OnDeckPlayer> | undefined
        columnIndex: number
        position: string[]
        positionIndex: number
        positionName: string
    }): AsyncGenerator<any, void, unknown>
}

export async function playerPositionsView({
    keepOpen = false,
    playerStateView,
    playerView,
    slot,
    title,
}: RenderArgs) {
    let [inPlayPlayers, onDeckPlayers, { positions }] = await Promise.all([
        playerStateView.inPlayPlayers(),
        playerStateView.onDeckPlayers(),
        playerStateView.positions(),
    ])

    return html`
<dialog class=modal traits="x-dialog" show-modal>
    <article ${when(keepOpen, 'data-box')} class="dialog-full-screen" style="--grid-item-width: 100px;">
        <header>
            <button form=modalClose aria-label="Close" value="cancel" rel="prev"></button>
            <h2>${title}</h2>
        </header>

${function* positionViews() {
    let positionIndex = 0
    for (let position of positions) {
        let count = 0
        yield html`<div class="grid grid-center pb-1">`
        yield position.map((_, index) => {
            let player = inPlayPlayers.find(x => positionIndex === x.status.position)
            let playerOnDeck = onDeckPlayers.find(x => positionIndex === x.status.targetPosition)
            let row = playerView({
                player,
                playerOnDeck,
                rowIndex: count,
                position,
                columnIndex: index,
                positionIndex,
                positionName: position[index]
            })
            count++
            positionIndex++
            return row
        })
        yield html`</div>`
    }
}}

${slot}

<form hidden id=modalClose method=dialog></form>
</article>
</dialog>`

}

