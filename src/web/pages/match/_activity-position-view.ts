import { PlayerStateView, positionPlayersView } from "./shared.js"

let {
    html,
    validation: {
        createIdNumber,
        createString25,
        createStringInfinity,
        maybe,
        validateObject,
        queryTeamIdGameIdValidator
    },
} = self.app

const queryActivityValidator = {
    ...queryTeamIdGameIdValidator,
    activityId: createIdNumber("Activity ID"),
    action: createString25("Action"),
    returnUrl: maybe(createStringInfinity("Return URL"))
}

export async function activityPlayerSelectorView(query: any) {
    let {
        teamId,
        gameId,
        activityId,
        action: operation,
        returnUrl,
    } = await validateObject(query, queryActivityValidator)

    let state = new PlayerStateView(teamId, gameId)
    let [ onDeckPlayers, outPlayers ] = await Promise.all([
        state.onDeckPlayers(),
        state.outPlayers(),
    ])

    let action = `/web/match?teamId=${teamId}&gameId=${gameId}&handler=setPlayerStat`
    let queryTeamGame = state.queryTeamGame

    return html`
<header>
    <a href="$${returnUrl ? returnUrl : `/web/match?${queryTeamGame}&handler=play`}">Cancel</a>&nbsp;
    <h2 class="inline">Player Goal</h2>
</header>
    ${positionPlayersView(
        state,
        ({ player }) => {
            if (!player) {
                return html`<span class=empty></span>`
            }
            return html`
            <form
                method=post
                action="$${action}"
                hf-target="#app">
                <input type=hidden name=activityId value="${activityId}">
                <input type=hidden name=playerId value="${player.playerId}">
                <input type=hidden name=operation value="${operation}">
                <input type=hidden name=returnUrl value="${returnUrl}">
                <button>${player.name}</button>
            </form>`
        },
        {gridItemWidth: "50px"}
    )}
<div class=grid style="--grid-item-width: 75px;">
    ${[...onDeckPlayers, ...outPlayers]
        .map(x => html`<form
            method=post
            action="$${action}"
            hf-target="#app">
            <input type=hidden name=activityId value="${activityId}">
            <input type=hidden name=playerId value="${x.playerId}">
            <input type=hidden name=operation value="${operation}">
            <input type=hidden name=returnUrl value="${returnUrl}">
            <button>${x.name}</button>
        </form>`)
    }
</div>`

}
