import html from "html-template-tag-stream"
import { playerGameAllGet, positionGetAll } from "../../server/repo-player-game.js"
import { teamGet } from "../../server/repo-team.js"
import { isInPlayPlayer, isOnDeckPlayer, isOutPlayer } from "./shared.js"
import { queryTeamIdGameIdValidator } from "../../server/validators.js"
import { validateObject } from "promise-validation"
import { createIdNumber, createString25 } from "../../server/validation.js"
import { sort } from "../../server/utils.js"
import { TeamPlayer } from "../../server/db.js"

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
    let notPlayingPlayers =
        sort(players.filter(x => !isInPlayPlayer(x) && (isOnDeckPlayer(x) || isOutPlayer(x)))
        .map(x => ({
            id: x.playerId,
            name: team.players.find(y => y.id === x.playerId)?.name,
        }))
        .filter((x) : x is { id: number, name: string } => x.name != null),
            x => x.name)

    let playerViewOptions : SelectPlayerViewOptions = {
        teamId,
        gameId,
        activityId,
        action,
        players: team.players
    }

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
            playerViewOptions.playerId = player?.playerId
            let row
            if (player) {
                row = selectPlayerView(playerViewOptions)
            } else {
                row = html`<span></span>`
            }

            count++
            return row
        })
        yield html`</div>`
    }

    yield notPlayingPlayers.map(x => {
        playerViewOptions.playerId = x.id
        return selectPlayerView(playerViewOptions)
    })
}}
</dialog>
</x-dialog>`
}

interface SelectPlayerViewOptions {
    teamId: number
    gameId: number
    activityId: number
    playerId?: number
    action: string
    players: TeamPlayer[]
}

function selectPlayerView(o: SelectPlayerViewOptions) {
    let action = `/web/match?teamId=${o.teamId}&gameId=${o.gameId}&handler=setPlayerStat`
    return html`
    <form
        method=post
        action="$${action}"
        $${ o.activityId === 1 ? `hf-target="#points"` : `hf-target="main"` }
        hf-scroll-to="#game-status">
        <input type=hidden name=activityId value="${o.activityId}">
        <input type=hidden name=playerId value="${o.playerId}">
        <input type=hidden name=operation value="${o.action}">
        <button>${o.players.find(x => x.id === o.playerId)?.name}</button>
    </form>`
}

