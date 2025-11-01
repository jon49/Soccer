import { Stats, Stat, get, getMany, PlayerGame, Positions, PositionsV0, set } from "./db.js"
import { teamGet } from "./repo-team.js"
import { reject } from "@jon49/sw/validation.js"

function getPlayerGameKey(teamId: number, gameId: number, playerId: number) {
    return ['player-game', teamId, playerId, gameId]
}

export async function playerGameSave(teamId: number, playerGame: PlayerGame) {
    await set(getPlayerGameKey(teamId, playerGame.gameId, playerGame.playerId), playerGame)
}

export async function playerGameAllGet(teamId: number, gameId: number, playerIds: number[]) {
    if (playerIds.length === 0) {
        playerIds = await teamGet(teamId).then(x => x.players.map(x => x.id))
    }
    let playersGame = await getMany<PlayerGame>(playerIds.map(x => getPlayerGameKey(teamId, gameId, x)))
    for (let i = 0; i < playersGame.length; i++) {
        if (!playersGame[i]) {
            playersGame[i] = {
                gameId,
                gameTime: [],
                playerId: playerIds[i],
                stats: [],
                _rev: 0,
            }
        }
    }
    return playersGame
}

/*** Positions ***/

function getPositionsId(teamId: number) {
    return ["positions", teamId]
}

export async function positionGetAll(teamId: number) : Promise<PositionsV0> {
    let positions = await get<Positions | PositionsV0>(getPositionsId(teamId))
    if (!positions) {
        positions = {
            _rev: 0,
            _v: 0,
            positions: [],
            grid: [],
        }
    }
    return upgradePositions(positions)
}

function upgradePositions(positions: any) {
    return [positionsToV0]
    .reduce((x, f) => f(x), positions)
}

function positionsToV0(positionsOld: Positions | PositionsV0) : PositionsV0 {
    if ("_v" in positionsOld) {
        return positionsOld
    }
    let positions: string[][] = []
    for (let grid of positionsOld.grid) {
        positions.push(positionsOld.positions.splice(0, grid))
    }
    return {
        _rev: positionsOld._rev,
        _v: 0,
        positions,
    }
}

export async function positionsSave(teamId: number, positions: PositionsV0) {
    await areUnique(positions.positions.flat().filter(x => x))
    await set(getPositionsId(teamId), positions)
}

/*** Stats ***/

export const statDescriptions = {
    Goal: "The number of times a player scores.",
    // Assist: "The number of passes or plays that directly lead to a goal.",
    // SOG: "Shots Off Target: The number of shots that miss the goal frame.",
    // SOT: "Shots on Target: The number of shots that hit the goal frame.",
    // Shooting: "Shooting Accuracy: The percentage of shots on target out of total shots attempted.",
    // Possession: "The percentage of time a team spends in control of the ball during a match.",
    // Passing: "Passing Accuracy: The percentage of successful passes out of total attempted passes.",
    // Tackle: "The number of defensive challenges made by players to win back possession.",
    // "Foul Committed": "The number of fouls a team or player commits.",
    // "Foul Received": "Fouls Received: The number of fouls a team or player commits or suffers.",
    // "Yellow Card": "The number of disciplinary actions a team or player receives during a match.",
    // "Red Card": "The number of disciplinary actions a team or player receives during a match.",
    // Corner: "The number of corner kicks awarded to a team.",
    // Offside: "The number of times a player is caught in an offside position.",
    // Interception: "The number of times a player interrupts an opponent's pass or play.",
    // "Clean Sheets": "The number of matches or periods in which a team does not concede any goals.",
    // Saves: "The number of shots on target that a goalkeeper stops.",
    // "Dribbles Completed": "The number of successful attempts to move past an opponent with the ball."
}

export const statIds: Record<StatName, number> = <any>Object.keys(statDescriptions)
    .reduce((acc, key, i) => {
        acc[key] = i + 1
        return acc
    }, {} as {[key: string]: number})

export function getStatDescription(id: number) {
    let statName = Object.keys(statDescriptions)[id - 1]
    // @ts-ignore
    return statDescriptions[statName]
}

export type StatName = keyof typeof statDescriptions

export async function statsGetAll(teamId: number) : Promise<Stats> {
    return (await get<Stats>(getStatsId(teamId)))
        ?? { stats: Object.keys(statDescriptions)
                .map((x, i) => ({
                    id: i + 1,
                    name: x,
                    active: true,
                })),
            _rev: 0 }
}

export async function statSave(teamId: number, stat: Stat) {
    let { stats, _rev } = await statsGetAll(teamId)

    let index = stats.findIndex(x => x.id === stat.id)
    if (index > -1) {
        stats[index] = stat
    } else {
        return reject("Stat not found.")
    }

    await statsSave(teamId, { stats, _rev })
}

export async function statsSave(teamId: number, {stats, _rev}: Stats) {
    await areUnique(stats.map(x => x.name))
    await set(getStatsId(teamId), { stats, _rev } as Stats)
}

function getStatsId(teamId: number) {
    return ["stats", teamId]
}

/*** Utilities ***/

function areUnique(xs: string[]) {
    let result = findDuplicateCaseInsensitive(xs)
    if (result) {
        return reject(`'${result[0]}' and '${result[1]}' are the same. Values must be unique!`)
    }
    return
}

function findDuplicateCaseInsensitive(arr: string[]) {
  const lowercaseMap = new Map();

  for (const value of arr) {
    const lowercaseValue = value.toLowerCase();

    if (lowercaseMap.has(lowercaseValue)) {
      // Found a duplicate
      return [value, lowercaseMap.get(lowercaseValue)];
    } else {
      lowercaseMap.set(lowercaseValue, value);
    }
  }

  // No duplicates found
  return null;
}
