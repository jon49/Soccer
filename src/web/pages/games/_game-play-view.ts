import { when } from "../../server/html.js"
import html from "html-template-tag-stream"
import { PlayerStateView } from "./shared.js"
import playerStateView from "./_player-state-view.js"

export function getPointsView(points: number) {
    return html`&nbsp;${points || "0"}&nbsp;`
}

export default async function render(req: Request) {
    let o = await PlayerStateView.create(req)
    let notes = await o.notes()
    let game = await o.game()
    let queryTeamGame = o.queryTeamGame
    let gameCalc = await o.gameCalc()

    let isGameInPlay = await o.isGameInPlay()
    let isGameEnded = await o.isGameEnded()
    let isGamePaused = await o.isGamePaused()

    return html`
<h2>Game Play — ${game.home ? "Home" : "Away"} — ${game.opponent}</h2>

<div id=root>
    ${when(!isGameEnded, () => html`
    <form class=inline method=post action="?$${queryTeamGame}&handler=${isGameInPlay ? "pauseGame" : "startGame"}">
        <button>${isGameInPlay ? "Pause" : "Start"}</button>
    </form>`)}

    <game-timer
        $${when(isGamePaused, () => `data-flash data-start="${gameCalc.getLastEndTime()}"`)}
        $${when(isGameInPlay, `data-start="${gameCalc.getLastStartTime()}" data-total="${gameCalc.total()}"`)}
        $${when(isGameEnded, `data-static`)}>
    </game-timer>

    <form class=inline method=post action="?$${queryTeamGame}&handler=${isGameEnded ? "restartGame" : "endGame"}">
        <button>${isGameEnded ? "Restart" : "End"}</button>
    </form>

    <ul class=list>
        <li>
            <span>Points</span>
            <form id=team-points class=inline method=post hf-target="#points" hidden></form>
            <button formaction="?$${queryTeamGame}&handler=pointsDec" form=team-points>-</button>
            <span id=points>${getPointsView(game.points)}</span>
            <button formaction="?$${queryTeamGame}&handler=pointsInc" form=team-points>+</button>
        </li>
        <li>
            <span>Opponent</span>
            <form id=opponent-points class=inline method=post hf-target="#o-points" hidden></form>
            <button formaction="?$${queryTeamGame}&handler=oPointsDec" form=opponent-points>-</button>
            <span id=o-points>${getPointsView(game.opponentPoints)}</span>
            <button formaction="?$${queryTeamGame}&handler=oPointsInc" form=opponent-points>+</button>
        </li>
    </ul>
</div>

<div id="player-state">${playerStateView(o)}</div>

<h3>Notes</h3>

<form method=post action="?${queryTeamGame}&handler=updateNote" onchange="this.requestSubmit()">
    <elastic-textarea>
        <textarea name=notes>${notes}</textarea>
    </elastic-textarea>
</form>
`
}
