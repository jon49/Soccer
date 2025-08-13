import html from "html-template-tag-stream"
import { playerGameAllGet, positionGetAll } from "../../server/repo-player-game.js"
import { teamGet } from "../../server/repo-team.js"
import { createPlayersView, isInPlayPlayer, isOnDeckPlayer, GamePlayerStatusView } from "./shared.js"
import { InPlayPlayer, OnDeckPlayer } from "../../server/db.js"
import { required } from "@jon49/sw/validation.js"

interface RenderArgs {
    teamId: number
    gameId: number
    title: string
    playerView(options: {
        player: GamePlayerStatusView<InPlayPlayer> | undefined,
        playerOnDeck: GamePlayerStatusView<OnDeckPlayer> | undefined
        count: number
        position: string[]
    }): AsyncGenerator<any, void, unknown>
}

export async function playerPositionsView({ gameId, teamId, title, playerView }: RenderArgs) {
    let team = await teamGet(teamId)
    team.players = team.players.filter(x => x.active)
    let [ players, { positions } ] = await Promise.all([
        playerGameAllGet(teamId, gameId, team.players.map(x => x.id)),
        positionGetAll(teamId),
    ])

    let game = await required(team.games.find(x => x.id === gameId), "Could not find game ID!")
    let inPlayPlayers = await createPlayersView(isInPlayPlayer, team.players, players, game)
    let onDeckPlayers = await createPlayersView(isOnDeckPlayer, team.players, players, game)

    return html`
<dialog class=modal traits="x-dialog" show-modal>
    <article class="dialog-full-screen" style="--grid-item-width: 100px;">
        <header>
            <button form=modalClose aria-label="Close" value="cancel" rel="prev"></button>
            <h2>${title}</h2>
        </header>

${function* positionViews() {
    let count = 0
    for (let position of positions) {
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

