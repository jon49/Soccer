import { PlayerStateView } from "./shared.js"
import { dialogPlayerPositionsView } from "./_player-position-view.js"
import { onDeckView } from "./_on-deck-view.js"
import { outPlayersView } from "./_out-player-view.js"
import { inPlayersView } from "./_in-play-players-view.js"
import { notPlayingPlayersView } from "./_not-playing-players-view.js"

let {
    html,
    utils: {when}
} = self.app

export default async function playMatchView(state: PlayerStateView) {
    let [
        isGameInPlay,
        inPlayPlayers,
        gameCalc,
        playersOnDeck,
        isGameEnded,
        isGamePaused,
    ] = await Promise.all([
        state.isGameInPlay(),
        state.inPlayPlayers(),
        state.gameCalc(),
        state.onDeckPlayers(),
        state.isGameEnded(),
        state.isGamePaused(),
    ])

    let queryTeamGame = state.queryTeamGame

    let countOnDeckPlayers = playersOnDeck.length
    let noPlayersExist = !inPlayPlayers.length && !countOnDeckPlayers
    let playersExist = !noPlayersExist

    let view = dialogPlayerPositionsView({
        playerStateView: state,
        title: html`
<div class=flex>
<div>
${when(countOnDeckPlayers > 0, () => html`
<button
    form=post-form
    formaction="/web/match?$${queryTeamGame}&handler=swapAll"
    hf-target="#dialogs">Swap All</button>
`)}
${when(playersExist, () => html`
<button
    traits="on"
    data-events="updatedInPlayers"
    data-action="this.hidden = !event.detail.count"

    form=post-form
    formaction="/web/match?$${queryTeamGame}&handler=allOut"
    hf-target="#dialogs">All Out</button>
`)}
</div>

<div class=flex>
    ${when(!isGameEnded, () => html`
    <button id=game-status
        form=post-form
        formaction="/web/match?$${queryTeamGame}&handler=${isGameInPlay ? "pauseGame" : "startGame"}"
        hf-target="#dialogs" >
        ${isGameInPlay ? "Pause" : "Start"}
    </button>`)}

    <span traits="game-timer"
        $${when(isGamePaused, () => `data-flash data-start="${gameCalc.getLastEndTime()}"`)}
        $${when(isGameInPlay, `data-start="${gameCalc.getLastStartTime()}" data-total="${gameCalc.total()}"`)}
        $${when(isGameEnded, `data-static data-total="${gameCalc.total()}"`)}>
        00:00
    </span>

    <button
        form=post-form
        formaction="/web/match?$${queryTeamGame}&handler=${isGameEnded ? "restartGame" : "endGame"}"
        hf-target="#dialogs"
        >
        ${isGameEnded ? "Restart" : "End"}
    </button>
</div>

<div>
<button
    form="get-form"
    formaction="/web/match?teamId=1&amp;gameId=1&amp;activityId=1&amp;handler=activityPlayerSelector&amp;action=inc"
    hf-target="#dialogs"
    aria-label="Game points ${gameCalc.game.points}"
    >${gameCalc.game.points}</button>
    VS
<button
    form=post-form
    formaction="/web/match?$${queryTeamGame}&handler=oPointsInc"
    hf-target="this"
    aria-label="Opponent points ${gameCalc.game.opponentPoints}"
    >${gameCalc.game.opponentPoints}</button>
</div>
</div>`,
        keepOpen: true,
        slot: [
            html`<div>${inPlayersView(state)}</div>`,
            html`
            <form
                traits="on"
                data-events="updatedInPlayers"
                action="/web/match?${queryTeamGame}&handler=inPlayerView"
                hf-target="#in-player-view"
                hf-swap="outerHTML"
            ></form>
            `
            ,
                html`
<h3 class="inline mt-2"
    traits="on"
    data-events="load onDeckListUpdated"
    data-action="this.innerText = 'On Deck (' + onDeckList.childElementCount + ')'"
    ></h3>
<button
    class="condense-padding"

    traits="on"
    data-events="load onDeckListUpdated"
    data-action="this.hidden = onDeckList.childElementCount < 2"

    form="get-form"
    formaction="/web/match?${queryTeamGame}&handler=rapidFire"
    hf-target="#dialogs">Rapid Fire</button>

<ul id=onDeckList class=list>
    ${onDeckView(state)}
</ul>`,

html`
<h3 class="mt-2"
    traits="on"
    data-events="load outPlayersListUpdated"
    data-action="this.innerText = 'Out Players (' + (outPlayersList.childElementCount - 1) + ')'"
></h3>
<ul id=outPlayersList class=list>
${outPlayersView(state)}
</ul>`,

html`
<h3 class="mt-2"
    traits="on"
    data-events="load notPlayingPlayersListUpdated"
    data-action="this.innerText = 'Not Playing (' + notPlayingList.childElementCount + ')'"
></h3>
<ul id="notPlayingList" class=list>
${notPlayingPlayersView(state)}
</ul>`
        ]
    })

    return view
}
