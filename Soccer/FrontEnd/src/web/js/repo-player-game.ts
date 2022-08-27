import { Activity, get, getMany, PlayerGame, Position, set } from "./db";
import { equals, getNewId } from "./utils";

function getPlayerGameKey(gameId: number, playerId: number) {
    return `player-game:${playerId}|${gameId}`
}

export async function playerGameSave(gameId: number, playerGame: PlayerGame, playerId: number) {
    await set(getPlayerGameKey(gameId, playerId), playerGame)
}

export async function playerGameAllGet(gameId: number, playerIds: number[]) {
    let playersGame = await getMany<PlayerGame>(playerIds.map(x => getPlayerGameKey(gameId, x)))
    playersGame = playersGame.filter(x => x)
    let omittedPlayers : PlayerGame[] = []
    for (let playerId of playerIds) {
        if (playersGame.find(x => x.playerId === playerId)) continue
        omittedPlayers.push({
            gameId,
            gameTime: [],
            playerId,
            stats: [],
        })
    }
    return playersGame.concat(omittedPlayers)
}

function getPositionsId(teamId: number) {
    return `positions:${teamId}`
}

export async function positionGetAll(teamId: number) : Promise<Position[]> {
    return (await get<Position[]>(getPositionsId(teamId))) ?? []
}

export async function positionCreateOrGet(teamId: number, position: string) : Promise<Position> {
    let positions = await positionGetAll(teamId)
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
    let positions = await positionGetAll(teamId)
    let existingPosition = positions.find(x => x.id === position.id)
    if (existingPosition) return
    positions.push(position)
    await set(getPositionsId(teamId), positions)
}

export async function activityGetAll(teamId: number) : Promise<Activity[]> {
    return (await get<Activity[]>(`${teamId}|activities`)) ?? []
}