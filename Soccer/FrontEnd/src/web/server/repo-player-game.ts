import { Activities, get, getMany, PlayerGame, Position, Positions, set } from "./db";
import { equals, getNewId } from "./utils";

function getPlayerGameKey(teamId: number, gameId: number, playerId: number) {
    return `player-game:${teamId}|${playerId}|${gameId}`
}

export async function playerGameSave(teamId: number, playerGame: PlayerGame) {
    await set(getPlayerGameKey(teamId, playerGame.gameId, playerGame.playerId), playerGame)
}

export async function playerGameAllGet(teamId: number, gameId: number, playerIds: number[]) {
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

function getPositionsId(teamId: number) {
    return `positions:${teamId}`
}

export async function positionGetAll(teamId: number) : Promise<Positions> {
    return (await get<Positions>(getPositionsId(teamId))) ?? { _rev: 0, positions: [] }
}

export async function positionCreateOrGet(teamId: number, position: string) : Promise<Position> {
    let { positions } = await positionGetAll(teamId)
    let positionObj = positions.find(x => equals(x.name, position))
    if (!positionObj) {
        positionObj = {
            id: getNewId(positions.map(x => x.id)),
            name: position,
        }
        await positionSave(teamId, positionObj)
    }
    return positionObj
}

async function positionSave(teamId: number, position: Position) {
    let { positions, _rev } = await positionGetAll(teamId)
    let existingPosition = positions.find(x => x.id === position.id)
    if (existingPosition) return
    positions.push(position)
    await set(getPositionsId(teamId), { positions, _rev })
}

export async function activityGetAll(teamId: number) : Promise<Activities> {
    return (await get<Activities>(`${teamId}|activities`)) ?? { activities: [], _rev: 0 }
}