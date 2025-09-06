import { PlayerStateView } from "./shared.js"
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
        outPlayers,
        notPlayingPlayers,
        isGameEnded,
        isGamePaused,
    ] = await Promise.all([
        state.isGameInPlay(),
        state.inPlayPlayers(),
        state.gameCalc(),
        state.onDeckPlayers(),
        state.outPlayers(),
        state.notPlayingPlayers(),
        state.isGameEnded(),
        state.isGamePaused(),
    ])

    let queryTeamGame = state.queryTeamGame

    let countOnDeckPlayersWithPosition = playersOnDeck.filter(x => x.status.targetPosition != null).length
    let noPlayersExist = !inPlayPlayers.length && !countOnDeckPlayersWithPosition
    let playersExist = !noPlayersExist

    return html`
<header class=flex>
<div>
<a href="/web/match?${queryTeamGame}">Back</a>
${when(countOnDeckPlayersWithPosition > 0, () => html`
<button
    form=post-form
    formaction="/web/match?$${queryTeamGame}&handler=swapAll"
    hf-target="#app"
    hf-swap="merge"
    >Swap All</button>
`)}
${when(playersExist, () => html`
<button
    form=post-form
    formaction="/web/match?$${queryTeamGame}&handler=allOut"
    hf-swap="merge"
    hf-target="#app">All Out</button>
`)}
</div>

<div class=flex>
    ${when(!isGameEnded, () => html`
    <button
        id=game-status
        form=post-form
        formaction="/web/match?$${queryTeamGame}&handler=${isGameInPlay ? "pauseGame" : "startGame"}"
        hf-swap="merge"
        hf-target="#app" >
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
        hf-target="#app"
        hf-swap="merge"
        >
        ${isGameEnded ? "Restart" : "End"}
    </button>
</div>

<div>
<button
    form="get-form"
    formaction="/web/match?${queryTeamGame}&activityId=1&handler=activityPlayerSelector&action=inc"
    hf-target="#app"
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
</header>
<br>
<div>${inPlayersView(state)}</div>

<h3 class="inline mt-2">On Deck (${playersOnDeck.filter(x => x.status.targetPosition == null).length})</h3>
${when(playersOnDeck.length > 1, () => html`
<button
    class="condense-padding"
    form="get-form"
    formaction="/web/match?${queryTeamGame}&handler=rapidFire"
    hf-target="#app">Rapid Fire</button>
`)}

<ul id=onDeckList class=list>
    ${onDeckView(state)}
</ul>

<h3 class="mt-2">Out Players (${outPlayers.length})</h3>
<ul id=outPlayersList class=list>
${outPlayersView(state)}
</ul>

<h3 class="mt-2">Not Playing (${notPlayingPlayers.length})</h3>
<ul id="notPlayingList" class=list>
${notPlayingPlayersView(state)}
</ul>`

}
