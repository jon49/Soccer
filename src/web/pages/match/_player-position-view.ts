import html from "html-template-tag-stream"
import { GamePlayerStatusView, PlayerStateView, positionPlayersView } from "./shared.js"
import { InPlayPlayer, OnDeckPlayer } from "../../server/db.js"
import { when } from "@jon49/sw/utils.js"

interface RenderArgs {
    slot?: AsyncGenerator<any, void, unknown> | undefined | null | (AsyncGenerator<any, void, unknown> | undefined | null)[]
    keepOpen?: boolean
    title: string | AsyncGenerator<any, void, unknown>
    playerStateView: PlayerStateView
    playerView?: (options: {
            rowIndex: number
            player: GamePlayerStatusView<InPlayPlayer> | undefined,
            playerOnDeck: GamePlayerStatusView<OnDeckPlayer> | undefined
            columnIndex: number
            position: string[]
            positionIndex: number
            positionName: string
        }) => AsyncGenerator<any, void, unknown>
}

export async function dialogPlayerPositionsView({
    keepOpen = false,
    playerStateView,
    playerView,
    slot,
    title,
}: RenderArgs) {
    return html`
<dialog class=modal traits="x-dialog" show-modal>
    <article ${when(keepOpen, 'data-box')} class="dialog-full-screen" style="--grid-item-width: 100px;">
        <header>
            <button form=modalClose aria-label="Close" value="cancel" rel="prev"></button>
            <h2>${title}</h2>
        </header>

${when(playerView, view => positionPlayersView(playerStateView, view))}

${slot}

<form hidden id=modalClose method=dialog></form>
</article>
</dialog>`

}

