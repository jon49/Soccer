import { validateObject } from "promise-validation"
import { PlayerGameTime, InPlayPlayer, OnDeckPlayer, PlayerGame, PlayerGameStatus, PlayerStatus, TeamPlayer, GameTime, Game, OutPlayer, NotPlayingPlayer } from "../../server/db.js"
import { playerGameAllGet, playerGameSave, positionGetAll, statsGetAll } from "../../server/repo-player-game.js"
import { getGameNotes, teamGet } from "../../server/repo-team.js"
import { tail } from "../../server/utils.js"
import { required } from "@jon49/sw/validation.js"
import { queryTeamIdGameIdValidator } from "../../server/validators.js"
import { DbCache, when } from "@jon49/sw/utils.js"
import html from "html-template-tag-stream"

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
        await playerGameSave(teamId, {
            playerId: this.player.playerId,
            gameId: this.player.gameId,
            gameTime: this.player.gameTime,
            _rev: this.player._rev,
            stats: this.player.stats,
            status: this.player.status,
        })
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
    teamId: number
    gameId: number
    #cache: DbCache
    constructor(teamId: number, gameId: number) {
        this.teamId = teamId
        this.gameId = gameId
        this.#cache = new DbCache()
    }

    async stats() {
        return this.#cache.get("stats", async () =>
            await statsGetAll(this.teamId))
    }

    async team() {
        return this.#cache.get("team", async () => {
            let team = await teamGet(this.teamId)
            team.players = team.players.filter(x => x.active)
            return team
        })
    }

    async player(playerId: number) {
        return this.#cache.get(
            `player-${playerId}`,
            async () => {
                let team = await this.team()
                return required(team.players.find(x => x.id === playerId), "Could not find player ID!")
            }
        )
    }

    async playerGame(playerId: number) {
        return this.#cache.get(
            `playerGame-${playerId}`,
            async () => {
                let gamePlayers = await this.gamePlayers()
                return required(gamePlayers.find(x => x.playerId === playerId), "Could not find player game!")
            }
        )
    }

    async notes() {
        return this.#cache.get("notes", async () =>
            (await getGameNotes(this.teamId, this.gameId)).notes)
    }

    async game() {
        return this.#cache.get("game", async () =>
            required(
                (await this.team()).games.find(x => x.id === this.gameId),
                "Could not find game ID!"))
    }

    get queryTeamGame() {
        return `teamId=${this.teamId}&gameId=${this.gameId}`
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
            return await playerGameAllGet(this.teamId, this.gameId, team.players.map(x => x.id))
        })
    }

    async positions() {
        return this.#cache.get("positions", () => positionGetAll(this.teamId))
    }

    async players() {
        return this.#cache.get("players", async () => (await this.team()).players)
    }

    async inPlayPlayers() {
        return this.#cache.get("inPlayPlayers", async () =>
            createPlayersView(
                isInPlayPlayer,
                (await this.players()),
                (await this.gamePlayers()),
                await this.game()
            )
        )
    }

    async countInPlayPlayers() {
        return this.#cache.get("playersInPlay", async () =>
            (await this.inPlayPlayers()).length
        )
    }

    async onDeckPlayers() {
        return this.#cache.get("onDeckPlayers", async () =>
            createPlayersView(
                isOnDeckPlayer,
                await this.players(),
                await this.gamePlayers(),
                await this.game())
        )
    }

    async countPlayersOnDeck() {
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

    async countNotPlayingPlayers() {
        return this.#cache.get("playersNotPlaying", async () => (await this.notPlayingPlayers()).length)
    }

    isInPlayersFull() {
        return this.#cache.get("isInPlayersFull", async () => {
            let countPlayersOnDeck = await this.countPlayersOnDeck()
            let countInPlayPlayers = await this.countInPlayPlayers()
            let totalPositions = (await this.positions()).positions.flat().length
            return countInPlayPlayers + countPlayersOnDeck >= totalPositions
        })
    }

    static async create(query: any) {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        return new PlayerStateView(teamId, gameId)
    }

}

export async function* positionPlayersView(
    state: PlayerStateView,
    playerView: (o: PlayerViewProps) => Promise<AsyncGenerator<any, void, unknown>> | AsyncGenerator<any, void, unknown>,
    { gridItemWidth }: { gridItemWidth?: string } = {}) {

    let [
        inPlayPlayers,
        onDeckPlayers,
        { positions }
    ] = await Promise.all([
        state.inPlayPlayers(),
        state.onDeckPlayers(),
        state.positions(),
    ])

    let positionIndex = 0
    for (let position of positions) {
        let count = 0
        yield html`<div ${when(gridItemWidth, () => html`style="--grid-item-width: $${gridItemWidth};"`)}  class="grid grid-center pb-1">`
        yield position.map((_, index) => {
            let player = inPlayPlayers.find(x => positionIndex === x.status.position)
            let playerOnDeck = onDeckPlayers.find(x => positionIndex === x.status.targetPosition)
            let row = playerView({
                player,
                playerOnDeck,
                rowIndex: count,
                position,
                columnIndex: index,
                positionIndex,
                positionName: position[index],
                state
            })
            count++
            positionIndex++
            return row
        })
        yield html`</div>`
    }
}

interface PlayerViewProps {
    rowIndex: number
    player: GamePlayerStatusView<InPlayPlayer> | undefined
    playerOnDeck: GamePlayerStatusView<OnDeckPlayer> | undefined
    columnIndex: number
    position: string[]
    positionIndex: number
    positionName: string
    state: PlayerStateView
}
