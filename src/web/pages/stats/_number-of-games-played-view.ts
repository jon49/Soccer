import type { StatsView } from "./shared.js"

const {
    html,
} = self.app

export async function gamesPlayedView(o: StatsView) {

    let [ playerIdList,
          playerMap,
          playersGames,
        ] = await Promise.all([
        o.playerIdList(),
        o.playerMap(),
        o.playerGames(),
    ])

    return html`
    <h3>Number of Games Played</h3>
    <table>
        <thead>
            <tr> <th>Player</th> <th>Games</th> </tr>
        </thead>
    <tbody>
    ${function* (){
        for (let playerId of playerIdList) {
            yield html`<tr><th>${playerMap.get(playerId)}</th>`
            let games = 0
            for (let playerGames of playersGames) {
                if (playerGames.find(x => x.playerId === playerId)?.gameTime?.length ?? 0 > 0) {
                    games++
                }
            }
            yield html`<td>${games}</td>`
        }
    }}
    </tbody>
    </table>`
}

