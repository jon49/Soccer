import { Activity, get, getMany, PlayerGame, Position, set } from "./db";
import { equals } from "./utils";
import { assert } from "./validation";

function getPlayerGameKey(gameId: number, player: string) {
    return `${gameId}|${player}`
}

export async function playerGameSave(gameId: number, playerGame: PlayerGame, player: string) {
    assert.isFalse(!playerGame, "Player game is required to save!")
    await set(getPlayerGameKey(gameId, player), playerGame)
}

export async function playerGameAllGet(gameId: number, playerNames: string[]) {
    let playersGame = await getMany<PlayerGame>(playerNames.map(x => `${gameId}|${x}`))
    playersGame = playersGame.filter(x => x)
    let omittedPlayers : PlayerGame[] = []
    for (let player of playerNames) {
        if (playersGame.find(x => x.name === player)) continue
        omittedPlayers.push({
            gameId,
            gameTime: [],
            name: player,
            stats: [],
        })
    }
    return playersGame.concat(omittedPlayers)
}

function getPositionsId(teamId: number) {
    return `${teamId}|positions`
}

export async function positionGetAll(teamId: number) : Promise<Position[]> {
    return (await get<Position[]>(getPositionsId(teamId))) ?? []
}

function createPosition(position: string) : Position {
    return {
        id: +new Date(),
        name: position,
    }
}

export async function positionCreateOrGet(teamId: number, position: string) : Promise<Position> {
    let positions = await positionGetAll(teamId)
    let positionObj = positions.find(x => equals(x.name, position))
    if (!positionObj) {
        positionObj = createPosition(position)
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