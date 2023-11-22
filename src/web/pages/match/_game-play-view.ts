import { when } from "../../server/html.js"
import html from "html-template-tag-stream"
import { PlayerStateView } from "./shared.js"
import playerStateView from "./_player-state-view.js"

export function getPointsView(points: number) {
    return html`&nbsp;${points || "0"}&nbsp;`
}

export default async function render(query: any) {
    let o = await PlayerStateView.create(query),
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
<form id=game-status
      class=inline
      method=post
      action="/web/match?$${queryTeamGame}&handler=${isGameInPlay ? "pauseGame" : "startGame"}"
      hf-target=main >
    <button>${isGameInPlay ? "Pause" : "Start"}</button>
</form>`)}

<game-timer
    $${when(isGamePaused, () => `data-flash data-start="${gameCalc.getLastEndTime()}"`)}
    $${when(isGameInPlay, `data-start="${gameCalc.getLastStartTime()}" data-total="${gameCalc.total()}"`)}
    $${when(isGameEnded, `data-static data-total="${gameCalc.total()}"`)}>
</game-timer>

<form
    class=inline
    method=post
    action="/web/match?$${queryTeamGame}&handler=${isGameEnded ? "restartGame" : "endGame"}"
    hf-target="main"
    >
    <button>${isGameEnded ? "Restart" : "End"}</button>
</form>

<form id=team-points hf-target="#dialogs" hidden></form>
<form
    is=x-subscribe
    data-event="playerStatUpdated"
    data-match='{"statId":1}'
    action="/web/match?$${queryTeamGame}&handler=points"
    hf-target="#points"
    hidden></form>
<form id=opponent-points class=inline method=post hf-target="#o-points" hidden></form>

<ul class=list>
    <li>
        <span>Points</span>
        ${() => {
            let action = `/web/match?${queryTeamGame}&activityId=1&handler=activityPlayerSelector`
            return html`
            ${when(!isGameEnded, () =>
                   html`<button formaction="$${action}&action=dec" form=team-points>-</button>`)}
            <span id=points>${getPointsView(game.points)}</span>
            ${when(!isGameEnded, () =>
                   html`<button formaction="$${action}&action=inc" form=team-points>+</button>`)}`
        }}
    </li>
    <li>
        <span>Opponent</span>
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
