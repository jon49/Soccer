import { PlayerGameTime, InPlayPlayer, OnDeckPlayer, PlayerGame, PlayerGameStatus, PlayerStatus, TeamPlayer, GameTime, Game } from "../../server/db.js"
import { playerGameSave } from "../../server/repo-player-game.js"
import { tail } from "../../server/utils.js"
import { required } from "../../server/validation.js"

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

export function filterInPlayPlayers(x: PlayerGame) : x is PlayerGameStatus<InPlayPlayer> {
    return x.status?._ === "inPlay"
}

export function filterOnDeckPlayers(x: PlayerGame) : x is PlayerGameStatus<OnDeckPlayer> {
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

