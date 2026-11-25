import type { TeamId } from "../../data/db.js";
import type { PlayersShown } from "../../data/utils.js";
import { playedInOrder } from "./stats-logic.js";
import html from "html-template-tag-stream";
import { teamGet, gameStatesGet } from "../../data/repo-team.js";
import { playerGameAllGet } from "../../data/repo-player-game.js";
import { DbCache, formatShortDate, playersShown } from "../../data/utils.js";
import { validateObject } from "promise-validation";
import { queryTeamIdValidator } from "../../data/validators.js";

export class StatsView {
  #cache: DbCache;
  teamId: TeamId;
  show: PlayersShown;
  constructor(teamId: TeamId, show: PlayersShown) {
    this.teamId = teamId;
    this.show = show;
    this.#cache = new DbCache();
  }

  async team() {
    return this.#cache.get("team", () => teamGet(this.teamId));
  }

  async playerMap() {
    return this.#cache.get("playerMap", async () =>
      (await this.team()).players.reduce(
        (acc, x) => {
          acc.set(x.id, x.name);
          return acc;
        },
        new Map() as Map<number, string>,
      ),
    );
  }

  async playerGames() {
    return this.#cache.get("playerGames", async () =>
      Promise.all((await this.team()).games.map((x) => playerGameAllGet(this.teamId, x.id, []))),
    );
  }

  async gameStates() {
    return this.#cache.get("gameStates", async () =>
      gameStatesGet(this.teamId, (await this.team()).games),
    );
  }

  // Played games in date order, each with its state and players' records.
  async playedGames() {
    return this.#cache.get("playedGames", async () => {
      let [team, playerGames, gameStates] = await Promise.all([
        this.team(),
        this.playerGames(),
        this.gameStates(),
      ]);
      return playedInOrder(
        team.games.map((game, i) => ({ game, players: playerGames[i], state: gameStates[i] })),
      );
    });
  }

  async positionPlayerStats() {
    return this.#positionPlayerStats().then((x) => x.positionPlayerStats);
  }

  async #positionPlayerStats() {
    return this.#cache.get("positionPlayerStats", async () => {
      let players: Set<number> = new Set();
      let positions: Set<string> = new Set();
      let positionPlayerStats = (await this.playerGames()).reduce(
        (acc, xs) => {
          for (let playerGame of xs) {
            players.add(playerGame.playerId);
            for (let time of playerGame.gameTime) {
              if (!time.position) continue;
              positions.add(time.position);
              let position = acc[time.position];
              if (!position) acc[time.position] = position = {};
              let player = position[playerGame.playerId];
              if (!player) position[playerGame.playerId] = player = { time: 0 };
              if (time.start && time.end) player.time += time.end - time.start;
            }
          }
          return acc;
        },
        {} as { [position: string]: { [playerId: string]: { time: number } } },
      );
      return { positionPlayerStats, players, positions };
    });
  }

  async playerIdList() {
    return this.#cache.get("playerIdList", async () =>
      playersShown((await this.team()).players, this.show).map((x) => x.id),
    );
  }

  async positions() {
    return this.#cache.get("positions", async () => {
      let positions = await this.#positionPlayerStats().then((x) => x.positions);
      return Array.from(positions).sort();
    });
  }

  static async create(query: any) {
    let { teamId } = await validateObject(query, queryTeamIdValidator);
    return new StatsView(teamId, playersShownQuery(query));
  }
}

// A per-game column's header: the date over the opponent.
export function gameColumnHeader({ game }: { game: { date: string; opponent?: string } }) {
  return html`<th class=game-column><span>${formatShortDate(game.date)}</span> <small>${game.opponent}</small></th>`;
}

// Subs and inactive players are left out of the tables unless the query asks
// for them with subs=1 or inactive=1.
export function playersShownQuery(query: any): PlayersShown {
  return { subs: query?.subs === "1", inactive: query?.inactive === "1" };
}
