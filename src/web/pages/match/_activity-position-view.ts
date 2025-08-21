import html from "html-template-tag-stream"
import { PlayerStateView } from "./shared.js"
import { queryTeamIdGameIdValidator } from "../../server/validators.js"
import { validateObject } from "promise-validation"
import { createIdNumber, createString25 } from "@jon49/sw/validation.js"
import { dialogPlayerPositionsView } from "./_player-position-view.js"

const queryActivityValidator = {
    ...queryTeamIdGameIdValidator,
    activityId: createIdNumber("Activity ID"),
    action: createString25("Action")
}

export async function activityPlayerSelectorView(query: any) {
    let { teamId, gameId, activityId, action: operation } = await validateObject(query, queryActivityValidator)

    let o = new PlayerStateView(teamId, gameId)
    let [ onDeckPlayers, outPlayers ] = await Promise.all([
        o.onDeckPlayers(),
        o.outPlayers(),
    ])

    let action = `/web/match?teamId=${teamId}&gameId=${gameId}&handler=setPlayerStat`

    return dialogPlayerPositionsView({
        playerStateView: o,
        keepOpen: true,
        title: `Player Goal`,
        playerView: ({ player }) => {
            if (!player) {
                return html`<span class=empty></span>`
            }
            return html`
            <form
                method=post
                action="$${action}"
                hf-target="#dialogs">
                <input type=hidden name=activityId value="${activityId}">
                <input type=hidden name=playerId value="${player.playerId}">
                <input type=hidden name=operation value="${operation}">
                <button>${player.name}</button>
            </form>`
        },
        slot: html`
        <div class=grid style="--grid-item-width: 75px;">
            ${[...onDeckPlayers, ...outPlayers]
                .map(x => {
                html`
                <form
                    method=post
                    action="$${action}"
                    hf-target="#dialogs">
                    <input type=hidden name=activityId value="${activityId}">
                    <input type=hidden name=playerId value="${x.playerId}">
                    <input type=hidden name=operation value="${operation}">
                    <button>${x.name}</button>
                </form>
                `
                })
            }
        </div>
        `,
    })

}
