import { PlayerStateView, positionPlayersView } from "./shared.js"

let {
    html,
    utils: { when },
    validation: {
        createIdNumber,
        createString25,
        createStringInfinity,
        maybe,
        validateObject,
        queryTeamIdGameIdValidator
    },
} = self.sw

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

    let action = `?teamId=${teamId}&gameId=${gameId}&handler=setPlayerStat`
    let queryTeamGame = state.queryTeamGame
    let isBasketballMode = (await state.team()).basketballMode

    return html`
<main id=main>
<header>
    <a href="$${returnUrl ? returnUrl : `?${queryTeamGame}&handler=play`}" target="_self">Cancel</a>&nbsp;
    <h2 class="inline">Player Goal</h2>
</header>
    ${when(isBasketballMode, () => html`
<fieldset>
    <legend>Points</legend>
    <div class="flex points" id=points>
        <label><input type="radio" name="points" value="1">1 Point</label>
        <label><input type="radio" name="points" value="2" checked>2 Points</label>
        <label><input type="radio" name="points" value="3">3 Points</label>
    </div>
    <script>
document.addEventListener("submit", e => {
    let form = e.target.form ?? e.target
    if (form.id.startsWith("player-")) {
        for (let input of points.querySelectorAll("input[name='points']")) {
            input.setAttribute("form", form.id)
        }
    }
})
    </script>
</fieldset>`)}

    ${positionPlayersView(
        state,
        ({ player }) => {
            if (!player) {
                return html`<span class=empty></span>`
            }
            return html`
            <form
                id="player-${player.playerId}"
                method=post
                action="$${action}"
                >
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
            id="player-${x.playerId}"
            method=post
            action="$${action}"
            >
            <input type=hidden name=activityId value="${activityId}">
            <input type=hidden name=playerId value="${x.playerId}">
            <input type=hidden name=operation value="${operation}">
            <input type=hidden name=returnUrl value="${returnUrl}">
            <button>${x.name}</button>
        </form>`)
    }
</div>
</main>`

}
