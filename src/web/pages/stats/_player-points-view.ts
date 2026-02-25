import type { StatsView } from "./shared.js"

const {
    html,
} = self.sw

export async function playerPointsView(o: StatsView) {
    let [playerIdList, playerMap, playersGames, team] = await Promise.all([
        o.playerIdList(),
        o.playerMap(),
        o.playerGames(),
        o.team(),
    ])

    return html`
    <h3>Player Points</h3>
    <table>
        <thead>
            <tr>
                <th>Player</th>
                <th>Total Points</th>
                ${team.games.map((_, index) => html`<th>${index + 1}</th>`)}
            </tr>
        </thead>
        <tbody>
        ${async function*() {
            for (let playerId of playerIdList) {
                let perGame = playersGames.map(xs => {
                    let pg = xs.find(x => x.playerId === playerId)
                    if (!pg) return 0
                    return pg.stats.reduce((acc, s) => acc + (s.count || 0), 0)
                })
                let total = perGame.reduce((acc, v) => acc + v, 0)

                yield html`<tr><th>${playerMap.get(playerId)}</th>`
                yield html`<td>${total === 0 ? "-" : total}</td>`
                yield perGame.map(x => html`<td>${x === 0 ? "-" : x}</td>`)
                yield html`</tr>`
            }
        }}
        </tbody>
    </table>`
}
