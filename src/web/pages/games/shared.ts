import { validateObject } from "promise-validation"
import { PlayerGameTime, InPlayPlayer, OnDeckPlayer, PlayerGame, PlayerGameStatus, PlayerStatus, TeamPlayer, GameTime, Game, OutPlayer, NotPlayingPlayer } from "../../server/db.js"
import { playerGameAllGet, playerGameSave, positionGetAll } from "../../server/repo-player-game.js"
import { getGameNotes, teamGet } from "../../server/repo-team.js"
import { searchParams, tail } from "../../server/utils.js"
import { required } from "../../server/validation.js"
import { queryTeamIdGameIdValidator } from "../../server/validators.js"

export interface GamePlayerStatusView<T extends PlayerStatus> extends PlayerGameStatus<T> {
    name: string
    calc: PlayerGameTimeCalculator
}

export async function createPlayersView<T extends PlayerStatus>(
        filter: (playerGame: PlayerGame) => playerGame is PlayerGameStatus<T>,
        teamPlayers: TeamPlayer[],
        players: PlayerGame[]) : Promise<GamePlayerStatusView<T>[]> {
    let typedPlayers_ = players.filter(filter)
    let typedPlayers = await Promise.all(typedPlayers_.map(async x => {
        let calc = new PlayerGameTimeCalculator(x)
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

export class PlayerGameTimeCalculator {
    times: PlayerGameTime[]
    player: PlayerGame
    constructor(player: PlayerGame) {
        this.player = player
        player.gameTime = player.gameTime || []
        this.times = player.gameTime
    }

    start() {
        let time = tail(this.times)
        if (!time || !time.position) {
            throw new Error("Cannot start new time a position assigned!")
        }
        if (time.end) {
            throw new Error("Cannot start when already ended!")
        }
        time.start = +new Date()
    }

    end() {
        let time = tail(this.times)
        if (!time || !time.start) {
            throw new Error("Cannot end time without starting!")
        }
        time.end = +new Date()
    }

    position(position: string) {
        let time = tail(this.times)
        if (time && !time.end && time.start) {
            throw new Error("Cannot set position without ending previous time!")
        }
        if (time && !time.start) {
            time.position = position
            return
        }
        this.times.push({
            position
        })
    }

    pop() {
        this.times.pop()
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
        let time = tail(this.times)
        return time && !time.end && time.start
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
        this.game = game
        this.times = game.gameTime = game.gameTime || []
    }

    start() {
        let time = tail(this.times)
        if (!time?.end) {
            throw new Error("Cannot start when has not ended!")
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

    getLastEndTime() {
        return tail(this.times)?.end
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
    #cache: Cache
    constructor(teamId: number, gameId: number) {
        this.#teamId = teamId
        this.#gameId = gameId
        this.#cache = new Cache()
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
            createPlayersView(isInPlayPlayer, (await this.team()).players, (await this.gamePlayers()))
        )
    }

    async playersInPlay() {
        return this.#cache.get("playersInPlay", async () =>
            (await this.inPlayPlayers()).length
        )
    }

    async onDeckPlayers() {
        return this.#cache.get("onDeckPlayers", async () =>
            createPlayersView(isOnDeckPlayer, (await this.team()).players, (await this.gamePlayers()))
        )
    }

    async playersOnDeck() {
        return this.#cache.get("playersOnDeck", async () => (await this.onDeckPlayers()).length)
    }


    async outPlayers() {
        return this.#cache.get("outPlayers", async () => {
            let players = await createPlayersView(filterOutPlayers, (await this.team()).players, (await this.gamePlayers()))
            return players.sort((a, b) => a.calc.total() - b.calc.total())
        })
    }

    async playersOut() {
        return this.#cache.get("playersOut", async () => (await this.outPlayers()).length)
    }

    async notPlayingPlayers() {
        return this.#cache.get("notPlayingPlayers", async () =>
            createPlayersView(filterNotPlayingPlayers, (await this.team()).players, (await this.gamePlayers()))
        )
    }

    async playersNotPlaying() {
        return this.#cache.get("playersNotPlaying", async () => (await this.notPlayingPlayers()).length)
    }

    static async create(req: Request) {
        let { teamId, gameId } = await validateObject(searchParams(req), queryTeamIdGameIdValidator)
        return new PlayerStateView(teamId, gameId)
    }

}

class Cache {
    #cache: Map<string, any>
    constructor() {
        this.#cache = new Map()
    }

    async get<T>(key: string, fn: () => Promise<T>): Promise<T> {
        if (this.#cache.has(key)) {
            return this.#cache.get(key)
        }
        let value = await fn()
        this.#cache.set(key, value)
        return value
    }
}

