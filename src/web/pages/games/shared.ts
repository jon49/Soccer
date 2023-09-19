import { InPlayPlayer, OnDeckPlayer, PlayerGame, PlayerGameStatus, PlayerStatus, TeamPlayer } from "../../server/db.js"
import { required } from "../../server/validation.js"

export async function createPlayersView<T extends PlayerStatus>(filter: (playerGame: PlayerGame) => playerGame is PlayerGameStatus<T>, teamPlayers: TeamPlayer[], players: PlayerGame[], gameTotalTime: number) {
    let typedPlayers_ = players.filter(filter)
    let currentTime = +new Date()
    let typedPlayers = await Promise.all(typedPlayers_.map(async x => {
        let { start, total } = getAggregateGameTime(x.gameTime)
        let calcTotal = total + (start ? currentTime - start : 0)
        let gamePlay = calcTotal / gameTotalTime
        let name = await required(teamPlayers.find(y => y.id === x.playerId)?.name, "Could not find player ID!")
        return { calcTotal, start, total, name, gamePlay: gamePlay, ...x }
    }))
    return typedPlayers
}

export function getAggregateGameTime(times: { start?: number, end?: number }[]) {
    let start = times.find(x => !x.end)?.start
    let total =
        times.reduce((acc, { end, start }) =>
            end && start ? acc + (end - start) : acc
        , 0)
    return { start, total }
}

export function filterInPlayPlayers(x: PlayerGame) : x is PlayerGameStatus<InPlayPlayer> {
    return x.status?._ === "inPlay"
}

export function filterOnDeckPlayers(x: PlayerGame) : x is PlayerGameStatus<OnDeckPlayer> {
    return x.status?._ === "onDeck"
}



