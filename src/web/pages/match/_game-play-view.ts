import { when } from "../../server/html.js"
import html from "html-template-tag-stream"
import { PlayerStateView } from "./shared.js"
import playerStateView from "./_player-state-view.js"

export function getPointsView(points: number) {
    return html`&nbsp;${points || "0"}&nbsp;`
}

export default async function render(req: Request) {
    let o = await PlayerStateView.create(req),
        notes = await o.notes(),
        game = await o.game(),
        team = await o.team(),
        queryTeamGame = o.queryTeamGame,
        gameCalc = await o.gameCalc(),
        isGameInPlay = await o.isGameInPlay(),
        isGameEnded = await o.isGameEnded(),
        isGamePaused = await o.isGamePaused()

    return html`
<h2>${team.name} ($${game.home ? "Home" : "Away"}) vs ${game.opponent}</h2>

${when(!isGameEnded, () => html`
<form class=inline
      method=post
      action="/web/match?$${queryTeamGame}&handler=${isGameInPlay ? "pauseGame" : "startGame"}"
      hf-target=main >
    <button>${isGameInPlay ? "Pause" : "Start"}</button>
</form>`)}

<game-timer
    $${when(isGamePaused, () => `data-flash data-start="${gameCalc.getLastEndTime()}"`)}
    $${when(isGameInPlay, `data-start="${gameCalc.getLastStartTime()}" data-total="${gameCalc.total()}"`)}
    $${when(isGameEnded, `data-static`)}>
</game-timer>

<form
    class=inline
    method=post
    action="/web/match?$${queryTeamGame}&handler=${isGameEnded ? "restartGame" : "endGame"}"
    hf-target="main"
    >
    <button>${isGameEnded ? "Restart" : "End"}</button>
</form>

<ul class=list>
    <li>
        <span>Points</span>
        <form id=team-points class=inline method=post hf-target="#points" hidden></form>
        ${when(!isGameEnded, () => html`<button formaction="/web/match?$${queryTeamGame}&handler=pointsDec" form=team-points>-</button>`)}
        <span id=points>${getPointsView(game.points)}</span>
        ${when(!isGameEnded, () => html`<button formaction="/web/match?$${queryTeamGame}&handler=pointsInc" form=team-points>+</button>`)}
    </li>
    <li>
        <span>Opponent</span>
        <form id=opponent-points class=inline method=post hf-target="#o-points" hidden></form>
        ${when(!isGameEnded, () => html`<button formaction="/web/match?$${queryTeamGame}&handler=oPointsDec" form=opponent-points>-</button>`)}
        <span id=o-points>${getPointsView(game.opponentPoints)}</span>
        ${when(!isGameEnded, () => html`<button formaction="/web/match?$${queryTeamGame}&handler=oPointsInc" form=opponent-points>+</button>`)}
    </li>
</ul>

<div id="player-state">${playerStateView(o)}</div>

<h3>Notes</h3>

<form method=post action="/web/match?${queryTeamGame}&handler=updateNote" onchange="this.requestSubmit()">
    <elastic-textarea>
        <textarea name=notes>${notes}</textarea>
    </elastic-textarea>
</form>
`
}