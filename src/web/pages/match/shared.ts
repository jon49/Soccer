import { validateObject } from "promise-validation"
import { PlayerGameTime, InPlayPlayer, OnDeckPlayer, PlayerGame, PlayerGameStatus, PlayerStatus, TeamPlayer, GameTime, Game, OutPlayer, NotPlayingPlayer } from "../../server/db.js"
import { playerGameAllGet, playerGameSave, positionGetAll, statsGetAll } from "../../server/repo-player-game.js"
import { getGameNotes, teamGet } from "../../server/repo-team.js"
import { tail } from "../../server/utils.js"
import { required } from "@jon49/sw/validation.js"
import { queryTeamIdGameIdValidator } from "../../server/validators.js"
import { DbCache } from "../../server/shared.js"

export interface GamePlayerStatusView<T extends PlayerStatus> extends PlayerGameStatus<T> {
    name: string
    calc: PlayerGameTimeCalculator
}

export async function createPlayersView<T extends PlayerStatus>(
        filter: (playerGame: PlayerGame) => playerGame is PlayerGameStatus<T>,
        teamPlayers: TeamPlayer[],
        players: PlayerGame[],
        game: Game) : Promise<GamePlayerStatusView<T>[]> {
    let typedPlayers_ = players.filter(filter)
    let typedPlayers = await Promise.all(typedPlayers_.map(async x => {
        let calc =
            new PlayerGameTimeCalculator(x, new GameTimeCalculator(game))
        let name = await required(teamPlayers.find(y => y.id === x.playerId)?.name, "Could not find player ID!")
        return { name, calc, ...x }
    }))
    return typedPlayers
}

export function isInPlayPlayer(x: PlayerGame) : x is PlayerGameStatus<InPlayPlayer> {
    return x.status?._ === "inPlay"
}

export function isOnDeckPlayer(x: PlayerGame) : x is PlayerGameStatus<OnDeckPlayer> {
    return x.status?._ === "onDeck"
}

export function isOutPlayer(x: PlayerGame) : x is PlayerGameStatus<OutPlayer> {
    return x?.status?._ === "out"
}

export class PlayerGameTimeCalculator {
    times: PlayerGameTime[]
    player: PlayerGame
    gameCalc: GameTimeCalculator
    constructor(player: PlayerGame, gameCalc: GameTimeCalculator) {
        this.player = player
        player.gameTime = player.gameTime || []
        this.times = player.gameTime
        this.gameCalc = gameCalc
    }

    start() {
        let time = tail(this.times)
        if (!this.gameCalc.isGameOn()) {
            return
        }
        if (!time || !time.position) {
            return
        }
        if (time.end) {
            return
        }
        time.start = +new Date()
    }

    end() {
        let time = tail(this.times)
        if (!time?.start || time?.end) {
            return
        }
        time.end = +new Date()
    }

    position(position: string) {
        let time = tail(this.times)
        if (time && !time.end && time.start) {
            this.end()
            this.times.push({
                position
            })
            this.start()
            return
        }
        if (time && !this.hasStarted()) {
            time.position = position
            return
        }
        this.times.push({
            position
        })
    }

    playerOut() {
        if (!this.hasStarted()) {
            this.times.pop()
        } else {
            this.end()
        }
    }

    hasStarted() {
        return !!tail(this.times)?.start
    }

    getLastStartTime() {
        return tail(this.times)?.start
    }

    total() {
        return getTotal(this.times)
    }

    currentTotal() {
        return getCurrentTotal(this.times)
    }

    isGameOn() {
        return this.gameCalc.isGameOn()
    }

    currentPosition() {
        return tail(this.times)?.position
    }

    async save(teamId: number) {
        await playerGameSave(teamId, this.player)
    }
}

export class GameTimeCalculator {
    times: GameTime[]
    game: Game
    constructor(game: Game) {
        if (!game) {
            throw new Error("Game cannot be null!")
        }
        this.game = game
        if (!game.gameTime) {
            game.gameTime = []
        }
        this.times = game.gameTime
    }

    start() {
        let time = tail(this.times)
        if (time && !time.end) {
            return
        }
        this.times.push({
            start: +new Date(),
        })
    }

    end() {
        let time = tail(this.times)
        if (!time || !time.start) {
            throw new Error("Cannot end time without starting!")
        }
        time.end = +new Date()
    }

    isGameOn() {
        let time = tail(this.times)
        return !time?.end && time?.start
    }

    getLastStartTime() {
        return tail(this.times)?.start
    }

    getLastEndTime() {
        return tail(this.times)?.end
    }

    total() {
        return getTotal(this.times)
    }

    currentTotal() {
        return getCurrentTotal(this.times)
    }
}

function getTotal(times: { start?: number, end?: number }[]) {
    return times.reduce((acc, { end, start }) =>
            end && start ? acc + end - start : acc
        , 0)
}

function getCurrentTotal(times: { start?: number, end?: number }[]) {
    let total = getTotal(times)
    let t = tail(times)
    if (t && !t.end && t.start) {
        total += +new Date() - t.start
    }
    return total
}

function filterOutPlayers(x: PlayerGame) : x is PlayerGameStatus<OutPlayer> {
    return !x.status || x.status?._ === "out"
}

function filterNotPlayingPlayers(x: PlayerGame) : x is PlayerGameStatus<NotPlayingPlayer> {
    return x.status?._ === "notPlaying"
}

export class PlayerStateView {
    #teamId: number
    #gameId: number
    #cache: DbCache
    constructor(teamId: number, gameId: number) {
        this.#teamId = teamId
        this.#gameId = gameId
        this.#cache = new DbCache()
    }

    async stats() {
        return this.#cache.get("stats", async () =>
            await statsGetAll(this.#teamId))
    }

    async team() {
        return this.#cache.get("team", async () => {
            let team = await teamGet(this.#teamId)
            team.players = team.players.filter(x => x.active)
            return team
        })
    }

    async notes() {
        return this.#cache.get("notes", async () =>
            (await getGameNotes(this.#teamId, this.#gameId)).notes)
    }

    async game() {
        return this.#cache.get("game", async () =>
            required(
                (await this.team()).games.find(x => x.id === this.#gameId),
                "Could not find game ID!"))
    }

    get queryTeamGame() {
        return `teamId=${this.#teamId}&gameId=${this.#gameId}`
    }

    async gameCalc() {
        return this.#cache.get("gameCalc", async () =>
            new GameTimeCalculator(await this.game())
        )
    }

    async isGameInPlay() {
        return this.#cache.get("isGameInPlay", async () =>
            (await this.game()).status === "play"
        )
    }

    async isGameEnded() {
        return this.#cache.get("isGameEnded", async () =>
            (await this.game()).status === "ended"
        )
    }

    async isGamePaused() {
        return this.#cache.get("isGamePaused", async () => {
            return (await this.game()).status === "paused" || !(await this.isGameInPlay()) && !(await this.isGameEnded())
        })
    }

    async gamePlayers() {
        return this.#cache.get("gamePlayers", async () => {
            let team = await this.team()
            return await playerGameAllGet(this.#teamId, this.#gameId, team.players.map(x => x.id))
        })
    }

    async positions() {
        return this.#cache.get("positions", () => positionGetAll(this.#teamId))
    }

    async inPlayPlayers() {
        return this.#cache.get("inPlayPlayers", async () =>
            createPlayersView(isInPlayPlayer, (await this.team()).players, (await this.gamePlayers()), await this.game())
        )
    }

    async playersInPlay() {
        return this.#cache.get("playersInPlay", async () =>
            (await this.inPlayPlayers()).length
        )
    }

    async onDeckPlayers() {
        return this.#cache.get("onDeckPlayers", async () =>
            createPlayersView(isOnDeckPlayer, (await this.team()).players, (await this.gamePlayers()), await this.game())
        )
    }

    async playersOnDeck() {
        return this.#cache.get("playersOnDeck", async () => (await this.onDeckPlayers()).length)
    }


    async outPlayers() {
        return this.#cache.get("outPlayers", async () => {
            let players = await createPlayersView(filterOutPlayers, (await this.team()).players, (await this.gamePlayers()), await this.game())
            return players.sort((a, b) => a.calc.total() - b.calc.total())
        })
    }

    async playersOut() {
        return this.#cache.get("playersOut", async () => (await this.outPlayers()).length)
    }

    async notPlayingPlayers() {
        return this.#cache.get("notPlayingPlayers", async () =>
            createPlayersView(filterNotPlayingPlayers, (await this.team()).players, (await this.gamePlayers()), await this.game())
        )
    }

    async playersNotPlaying() {
        return this.#cache.get("playersNotPlaying", async () => (await this.notPlayingPlayers()).length)
    }

    static async create(query: any) {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        return new PlayerStateView(teamId, gameId)
    }

}

