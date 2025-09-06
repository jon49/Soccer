import { PlayerStateView } from "./shared.js"
import playerStateView from "./_player-state-view.js"
import type { Game } from "../../server/db.js"

let {
    html,
    repo: { statIds },
    utils: {when}
} = self.app

export function getPointsView(points: number) {
    return html`&nbsp;${points || "0"}&nbsp;`
}

export default async function render(query: any) {
    let state = await PlayerStateView.create(query),
        [
            notes,
            game,
            team,
            isGameEnded,
            { stats }
        ] = await Promise.all([
            state.notes(),
            state.game(),
            state.team(),
            state.isGameEnded(),
            state.stats()
        ]),
        queryTeamGame = state.queryTeamGame,
        isGoalTrackingEnabled = stats.find(x => x.id === statIds.Goal)?.active

    return html`
<h2>${team.name} ($${game.home ? "Home" : "Away"}) vs ${game.opponent}</h2>

<div class="pb-1">

<ul class=list>
    <li>

        <span>Points</span>

        ${isGoalTrackingEnabled
            ? goalTrackingEnabledView(queryTeamGame, isGameEnded, game)
        : goalTrackingDisabledView(queryTeamGame, isGameEnded, game)}

    </li>
    <li>
        <span>Opponent</span>

        <form id=opponent-points method=post hf-target="#o-points" hidden></form>

        ${when(!isGameEnded, () => html`<button formaction="/web/match?$${queryTeamGame}&handler=oPointsDec" form=opponent-points>-</button>`)}
        <span id=o-points>${getPointsView(game.opponentPoints)}</span>
        ${when(!isGameEnded, () => html`<button formaction="/web/match?$${queryTeamGame}&handler=oPointsInc" form=opponent-points>+</button>`)}
    </li>
</ul>

<div id="player-state">${playerStateView(state)}</div>

<h3>Notes</h3>

<form method=post action="/web/match?${queryTeamGame}&handler=updateNote" onchange="this.requestSubmit()">
    <elastic-textarea>
        <textarea name=notes>${notes}</textarea>
    </elastic-textarea>
</form>
`
}

function goalTrackingEnabledView(
    queryTeamGame: string,
    isGameEnded: boolean,
    game: Game
) {
    return html`
    <form id=team-points hf-target="#app" hidden></form>
    <form
        traits=on
        data-events="playerStatUpdated"
        data-match="detail:{statId:1}"

        action="/web/match?$${queryTeamGame}&handler=points"
        hf-target="#points"
        hidden></form>

    ${() => {
    let action = `/web/match?${queryTeamGame}&activityId=1&handler=activityPlayerSelector`
    return html`
    ${when(!isGameEnded, () =>
       html`<button class=condense-padding formaction="$${action}&action=dec" form=team-points>-</button>`)}
    <span id=points>${getPointsView(game.points)}</span>
    ${when(!isGameEnded, () =>
       html`<button class=condense-padding formaction="$${action}&action=inc" form=team-points>+</button>`)}`
    }}`
}

function goalTrackingDisabledView(
    queryTeamGame: string,
    isGameEnded: boolean,
    game: Game
) {
    return html`
        <form id=team-points method=post hf-target="#points" hidden></form>
        ${() => {
        let action = `/web/match?${queryTeamGame}`
        return html`
        ${when(!isGameEnded, () =>
           html`<button formaction="$${action}&handler=pointsDec" form=team-points>-</button>`)}
        <span id=points>${getPointsView(game.points)}</span>
        ${when(!isGameEnded, () =>
           html`<button formaction="$${action}&handler=pointsInc" form=team-points>+</button>`)}`
        }}`
}

