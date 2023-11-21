import html from "html-template-tag-stream"
import { playerGameAllGet, positionGetAll } from "../../server/repo-player-game.js"
import { teamGet } from "../../server/repo-team.js"
import { isInPlayPlayer } from "./shared.js"
import { queryTeamIdGameIdValidator } from "../../server/validators.js"
import { validateObject } from "promise-validation"
import { createIdNumber, createString25 } from "../../server/validation.js"

const queryActivityValidator = {
    ...queryTeamIdGameIdValidator,
    activityId: createIdNumber("Activity ID"),
    action: createString25("Action")
}

export async function activityPlayerSelectorView(query: any) {
    let { teamId, gameId, activityId, action } = await validateObject(query, queryActivityValidator)
    let team = await teamGet(teamId)
    team.players = team.players.filter(x => x.active)
    let [ players, { grid, positions } ] = await Promise.all([
        playerGameAllGet(teamId, gameId, team.players.map(x => x.id)),
        positionGetAll(teamId),
    ])

    let inPlayPlayers = players.filter(isInPlayPlayer)

    return html`
<x-dialog show-modal close-event="hf:completed">
<dialog class=modal>
<h2 id=game-goal-top class=inline>Goal For:</h2>
<form class=inline method=dialog hf-scroll-to="#game-status">
    <button>Cancel</button>
</form>

${function* activityTargetView() {
    let count = 0
    for (let width of grid) {
        yield html`<div class="row grid-center">`
        let p = positions.slice(count, count + width)
        if (p.length < width) {
            p = p.concat(new Array(width - p.length))
        }

        yield p.map(() => {
            let player = inPlayPlayers.find(x => count === x.status.position)
            let row
            if (player) {
                row = html`<form
                    method=post
                    action="/web/match?position=${count}&teamId=${teamId}&gameId=${gameId}&handler=setPlayerActivity"
                    $${ activityId === 1 ? `hf-target="#points"` : `hf-target="main"` }
                    hf-scroll-to="#game-status">
                    <input type=hidden name=activityId value="${activityId}">
                    <input type=hidden name=playerId value="${player.playerId}">
                    <input type=hidden name=operation value="${action}">
                    <button>${team.players.find(x => {
                        // @ts-ignore we already know the player is in play
                        return x.id === player.playerId
                    })?.name}</button>
                    </form>`
            } else {
                row = html`<span></span>`
            }

            count++
            return row
        })
        yield html`</div>`
    }
}}
</dialog>
</x-dialog>`

}

