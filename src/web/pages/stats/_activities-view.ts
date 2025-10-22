import type { StatsView } from "./shared.js"

const {
    html,
    repo: { statsGetAll },
} = self.sw

export async function playerStatsView(o: StatsView) {
    let [playerIdList,
        playerMap,
        playersGames,
        { stats: activities }
    ] = await Promise.all([
        o.playerIdList(),
        o.playerMap(),
        o.playerGames(),
        statsGetAll(o.teamId),
    ])

    activities.sort((a, b) => a.name.localeCompare(b.name))

    // playerId -> statId -> count
    let activityMap = new Map<number, Map<number, number>>()
    for (let playerGames of playersGames) {
        for (let playerGame of playerGames) {
            let activity = activityMap.get(playerGame.playerId)
            if (!activity) {
                activity = new Map<number, number>()
                activityMap.set(playerGame.playerId, activity)
            }
            for (let stat of playerGame.stats) {
                let count = activity.get(stat.statId)
                if (!count) {
                    activity.set(stat.statId, stat.count)
                } else {
                    activity.set(stat.statId, count + stat.count)
                }
            }
        }
    }

    return html`
    <h3>Activities</h3>
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
