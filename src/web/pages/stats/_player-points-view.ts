import { gameColumnHeader, type StatsView } from "./shared.js";

const { html } = self.sw;

export async function playerPointsView(o: StatsView) {
  let [playerIdList, playerMap, games] = await Promise.all([
    o.playerIdList(),
    o.playerMap(),
    o.playedGames(),
  ]);

  return html`
    <h3>Player Points</h3>
    <div class=table-fade><div class="overflow-auto table-scroll">
    <table class="sticky striped">
        <thead>
            <tr>
                <th>Player</th>
                <th>Total Points</th>
                ${games.map(gameColumnHeader)}
            </tr>
        </thead>
        <tbody>
        ${function* () {
          for (let playerId of playerIdList) {
            let perGame = games.map(({ players }) => {
              let pg = players.find((x) => x.playerId === playerId);
              if (!pg) return 0;
              return pg.stats.reduce((acc, s) => acc + (s.count || 0), 0);
            });
            let total = perGame.reduce((acc, v) => acc + v, 0);

            yield html`<tr><th>${playerMap.get(playerId)}</th>`;
            yield html`<td>${total === 0 ? "-" : total}</td>`;
            yield perGame.map((x) => html`<td>${x === 0 ? "-" : x}</td>`);
            yield html`</tr>`;
          }
        }}
        </tbody>
    </table>
    </div></div>`;
}
