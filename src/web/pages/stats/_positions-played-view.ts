import type { StatsView } from "./shared.js"

const {
    html,
} = self.sw

export async function timePlayedView(o: StatsView) {

    let [ positionPlayerStats,
          playerIdList,
          positionList,
          playerMap,
    ] = await Promise.all([
        o.positionPlayerStats(),
        o.playerIdList(),
        o.positions(),
        o.playerMap(),
    ])

    let positions = positionList.flat()

    return html`
    <h3>Positions Played (Hours:Minutes:Seconds)</h3>
    <table class="sticky">
    <thead>
        <tr>
            <th>Player</th>
            ${positions.map(x => html`<th>${x}</th>`)}
            <th>Total</th>
        </tr>
    </thead>
    <tbody>
        ${function* (){
            for (let playerId of playerIdList) {
                yield html`<tr><th>${playerMap.get(playerId)}</th>`
                for (let position of positions) {
                    let stats = positionPlayerStats[position]
                    if (!stats) {
                        yield html`<td></td>`
                        continue
                    }
                    let playerStats = positionPlayerStats[position][playerId]
                    yield html`<td>${playerStats ? millisecondsToHourMinutes(playerStats.time) : ""}</td>`
                }
                let totalTime = 0
                for (let position of positions) {
                    let stats = positionPlayerStats[position]
                    if (!stats) continue
                    let playerStats = positionPlayerStats[position][playerId]
                    if (!playerStats) continue
                    totalTime += playerStats.time
                }
                yield html`<td>${millisecondsToHourMinutes(totalTime)}</td>`
                yield html`</tr>`
            }
        }}
    </tbody>
    </table>`
}

function millisecondsToHourMinutes(milliseconds: number) {
    let seconds = Math.floor(milliseconds / 1e3)
    let minutes = Math.floor(seconds / 60)
    let hours = Math.floor(minutes / 60)
    minutes -= hours * 60
    seconds -= minutes * 60 + hours * 60 * 60
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
}

