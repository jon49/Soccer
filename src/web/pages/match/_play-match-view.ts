import { GameTimeCalculator, PlayerStateView } from "./shared.js"
import { onDeckView } from "./_on-deck-view.js"
import { outPlayersView } from "./_out-player-view.js"
import { inPlayersView } from "./_in-play-players-view.js"
import { notPlayingPlayersView } from "./_not-playing-players-view.js"

let {
    html,
    utils: {when}
} = self.sw

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

    let countOnDeckWithNoPosition = playersOnDeck.filter(x => x.status.targetPosition == null).length

    return html`
<main id=main>
<header class=flex>
<div>
<a href="?${queryTeamGame}" target="_self">Back</a>
${when(countOnDeckPlayersWithPosition > 0, () => html`
<button
    form=post
    formaction="?$${queryTeamGame}&handler=swapAll"
    >Swap All</button>
`)}
${when(playersExist, () => html`
<button
    form=post
    formaction="?$${queryTeamGame}&handler=allOut"
    _click="confirm"
    data-confirm="Are you sure you want to take all players out?"
    >All Out</button>
`)}
</div>

<div class=flex>
    ${when(!isGameEnded, () => html`
    <button
        id=gameStatus
        form=post
        formaction="?$${queryTeamGame}&handler=${isGameInPlay ? "pauseGame" : "startGame"}" >
        ${isGameInPlay ? "Pause" : "Start"}
    </button>`)}

    <span id=gameTimer traits="game-timer"
        $${when(isGamePaused, () => `data-flash data-start="${gameCalc.getLastEndTime()}"`)}
        $${when(isGameInPlay, `data-start="${gameCalc.getLastStartTime()}" data-total="${gameCalc.total()}"`)}
        $${when(isGameEnded, `data-static data-total="${gameCalc.total()}"`)}>
        00:00
    </span>

    <button
        form=post
        formaction="?$${queryTeamGame}&handler=${isGameEnded ? "restartGame" : "endGame"}"
        _click="confirm"
        data-confirm="Are you sure you would like to ${isGameEnded ? 'restart' : 'end'} the game?" >
        ${isGameEnded ? "Restart" : "End"}
    </button>
</div>

<div>
<button
    form="post"
    formaction="?${queryTeamGame}&activityId=1&handler=points&action=inc"
    aria-label="Game points ${gameCalc.game.points}"
    >${gameCalc.game.points}</button>
    VS
${opponentPointsView(queryTeamGame, gameCalc)}
</div>
</header>
<br>
<div>${inPlayersView(state)}</div>

<h3 id=onDeck class="inline mt-2">On Deck (${countOnDeckWithNoPosition})</h3>
${when(countOnDeckWithNoPosition > 1, () => html`
<a class="condense-padding" href="?${queryTeamGame}&handler=rapidFire" role="button">Rapid Fire</a>
`)}

<ul id=onDeckList class=list>
    ${onDeckView(state)}
</ul>

<h3 id=outPlayers class="mt-2">Out Players (${outPlayers.length})</h3>
<ul id=outPlayersList class=list>
${outPlayersView(state)}
</ul>

<h3 id=notPlaying class="mt-2">Not Playing (${notPlayingPlayers.length})</h3>
<ul id=notPlayingList class=list>
${notPlayingPlayersView(state)}
</ul>
</main>`

}

export function opponentPointsView(queryTeamGame: string, gameCalc: GameTimeCalculator) {
    return html`<button
id=opponentPoints
form=post
formaction="?$${queryTeamGame}&handler=oPointsIncPlay"
aria-label="Opponent points ${gameCalc.game.opponentPoints}"
>${gameCalc.game.opponentPoints}</button>`
}
