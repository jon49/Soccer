import html from "../../server/html.js"
import { activityGetAll } from "../../server/repo-player-game.js"
import { StatsView } from "./shared.js"

export async function activitiesView(o: StatsView) {
    let [playerIdList,
        playerMap,
        playersGames,
        { activities }
    ] = await Promise.all([
        o.playerIdList(),
        o.playerMap(),
        o.playerGames(),
        activityGetAll(o.teamId),
    ])

    activities.sort((a, b) => a.name.localeCompare(b.name))

    // playerId -> statId -> count
    let activityMap = new Map<number, Map<number, number>>()
    for (let playerId of playerIdList) {
        let activity = new Map<number, number>()
        activityMap.set(playerId, activity)
        for (let playerGames of playersGames) {
            let playerGame = playerGames.find(x => x.playerId === playerId)
            if (!playerGame) continue
            for (let stat of playerGame.stats) {
                let count = activity.get(stat.statId)
                if (!count) {
                    activity.set(stat.statId, 1)
                } else {
                    activity.set(stat.statId, count + 1)
                }
            }
        }
    }

    return html`
    <h2>Activities</h2>
    <table>
        <thead>
            <tr>
                <th>Player</th> 
                ${activities.map(x => html`<th>${x.name}</th>`)}
            </tr>
        </thead>
        <tbody>
        ${function*() {
            for (let playerId of playerIdList) {
                yield html`<tr><th>${playerMap.get(playerId)}</th>`
                let playerActivity = activityMap.get(playerId)
                for (let activity of activities) {
                    let count = playerActivity?.get(activity.id)
                    yield html`<td>${count}</td>`
                }
            }
        }}
        </tbody>
    </table>`
}
