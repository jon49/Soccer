import { getCurrentTotal } from "../match/state-logic.js";
import { gameColumnHeader, type StatsView } from "./shared.js";

const { html } = self.sw;

export async function percentagePlayed(o: StatsView) {
  let [playerIdList, playerMap, games] = await Promise.all([
    o.playerIdList(),
    o.playerMap(),
    o.playedGames(),
  ]);

  let gameTimes = new Map<number, number>();
  for (let { state } of games) {
    gameTimes.set(state.gameId, getCurrentTotal(state.gameTime));
  }

  return html`
    <h3>Average Percentage of Games Played</h3>
    <div class=overflow-auto>
    <table class="sticky striped">
    <thead>
        <tr>
            <th>Player</th>
            <th>Total Games</th>
            <th>% Played</th>
            ${games.map(gameColumnHeader)}
        </tr>
    </thead>
    <tbody>
        ${function* () {
          for (let playerId of playerIdList) {
            yield html`<tr><th>${playerMap.get(playerId)}</th>`;

            let playerGames = games.map(({ players }) =>
              players.find((x) => x.playerId === playerId),
            );
            let { rate, total } = playerGames.reduce(
              (acc, val) => {
                if ((val?.gameTime.length ?? 0) > 0) {
                  let totalTime = getCurrentTotal(val?.gameTime ?? []);
                  let rate = totalTime / (gameTimes.get(val?.gameId ?? 0) || 1);
                  acc.rate.push(rate);
                  acc.total++;
                  return acc;
                } else {
                  acc.rate.push(0);
                  return acc;
                }
              },
              { rate: [] as number[], total: 0 },
            );
            let percentagePlayed = (rate.reduce((acc, val) => acc + val, 0) / (total || 1)) * 100;

            yield html`<td>${total}</td>`;
            yield html`<td>${percentagePlayed === 0 ? "-" : `${percentagePlayed.toFixed(0)}%`}</td>`;
            yield rate.map((x) => html`<td>${x === 0 ? "-" : `${(x * 100).toFixed(0)}%`}</td>`);
            yield html`</tr>`;
          }
        }}
    </tbody>
    </table>
    </div>`;
}
