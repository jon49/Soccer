import { validateObject } from "promise-validation";
import { queryTeamIdValidator } from "../../server/validators.js";
import { teamGet } from "../../server/repo-team.js";
import { playerGameAllGet } from "../../server/repo-player-game.js";
import { DbCache } from "@jon49/sw/utils.js";

export class StatsView {
    #cache: DbCache
    teamId: number
    constructor(teamId: number) {
        this.teamId = teamId
        this.#cache = new DbCache()
    }

    async team() {
        return this.#cache.get("team", () => teamGet(this.teamId))
    }

    async playerMap() {
        return this.#cache.get("playerMap", async () =>
            (await this.team()).players
            .reduce((acc, x) => {
                acc.set(x.id, x.name);
                return acc },
            new Map as Map<number, string>))
    }

    async playerGames() {
        return this.#cache.get("playerGames", async () =>
            Promise.all(
                (await this.team()).games
                .map(x => playerGameAllGet(this.teamId, x.id, []))))
    }

    async positionPlayerStats() {
        return this.#positionPlayerStats().then(x => x.positionPlayerStats)
    }

    async #positionPlayerStats() {
        return this.#cache.get("positionPlayerStats", async () => {
            let players: Set<number> = new Set()
            let positions: Set<string> = new Set()
            let positionPlayerStats = (await this.playerGames()).reduce((acc, xs) => {
                for (let playerGame of xs) {
                    players.add(playerGame.playerId)
                    for (let time of playerGame.gameTime) {
                        if (!time.position) continue
                        positions.add(time.position)
                        let position = acc[time.position]
                        if (!position) acc[time.position] = position = {}
                        let player = position[playerGame.playerId]
                        if (!player) position[playerGame.playerId] = player = { time: 0 }
                        if (time.start && time.end)
                            player.time += time.end - time.start
                    }
                }
                return acc
            }, {} as { [position: string]: { [playerId: string]: { time: number } } })
            return { positionPlayerStats, players, positions }
        })
    }

    async playerIdList() {
        return this.#cache.get("playerIdList", async () =>
            Array.from(await this.playerMap())
            .sort((a, b) => (a[1] ?? "").localeCompare(b[1] ?? ""))
            .map(x => x[0]))
    }

    async positions() {
        return this.#cache.get("positions", async () => {
            let positions = await this.#positionPlayerStats().then(x => x.positions)
            return Array.from(positions).sort()
        })
    }

    static async create(query : any) {
        let { teamId } = await validateObject(query, queryTeamIdValidator)
        return new StatsView(teamId)
    }
}

