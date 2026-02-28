import type { StatsView } from "./shared.js"

const {
    html,
} = self.app

export async function percentagePlayed(o: StatsView) {

    let [
        playerIdList,
        playerMap,
        playersGames,
        team,
    ] = await Promise.all([
        o.playerIdList(),
        o.playerMap(),
        o.playerGames(),
        o.team(),
    ])

    let gameTimes = new Map<number, number>()
    for (let game of team.games) {
        let totalGameTime =
            game.gameTime
            .map(x => x.end ? x.end - x.start : 0)
            .reduce((acc, val) => acc + val, 0)
        gameTimes.set(game.id, totalGameTime)
    }

    return html`
    <h3>Average Percentage of Games Played</h3>
    <table>
    <thead>
        <tr>
            <th>Player</th>
            <th>Total Games</th>
            <th>% Played</th>
            ${team.games.map((_, index) => html`<th>${index + 1}</th>`)}
        </tr>
    </thead>
    <tbody>
        ${function* (){
            for (let playerId of playerIdList) {
                yield html`<tr><th>${playerMap.get(playerId)}</th>`

                let playerGames = playersGames.map(xs => xs.find(x => x.playerId === playerId))
                let {rate, total} = playerGames.reduce((acc, val) => {
                    if ((val?.gameTime.length ?? 0) > 0) {
                        let totalTime =
                            val?.gameTime
                            .map(x => x.end && x.start ? x.end - x.start : 0)
                            .reduce((acc, val) => {
                                return acc + val
                            }, 0) ?? 0
                        let rate = totalTime / (gameTimes.get(val?.gameId ?? 0) || 1)
                        acc.rate.push(rate)
                        acc.total++
                        return acc
                    } else {
                        acc.rate.push(0)
                        return acc
                    }
                }, { rate: [] as number[], total: 0 })
                let percentagePlayed = rate.reduce((acc, val) => acc + val, 0) / (total || 1) * 100

                yield html`<td>${total}</td>`
                yield html`<td>${percentagePlayed === 0 ? "-" : `${percentagePlayed.toFixed(0)}%`}</td>`
                yield rate.map(x => html`<td>${x === 0 ? "-" : `${(x * 100).toFixed(0)}%`}</td>`)
                yield html`</tr>`
            }
        }}
    </tbody>
    </table>`
}
