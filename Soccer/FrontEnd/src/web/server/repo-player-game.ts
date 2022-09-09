import { Activities, Activity, get, getMany, PlayerGame, Position, Positions, set } from "./db";
import { reject } from "./repo";
import { equals, getNewId } from "./utils";
import { assert, required } from "./validation";

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

export async function positionSave(teamId: number, position: Position) {
    let { positions, _rev } = await positionGetAll(teamId)
    let existingPosition = positions.find(x => x.id === position.id)
    if (existingPosition) return
    positions.push(position)
    await set(getPositionsId(teamId), { positions, _rev })
}

export async function positionsSave(teamId: number, positions: Positions) {
    await areUnique(positions.positions.map(x => x.name))
    await set(getPositionsId(teamId), positions)
}

/*** Activities ***/

export async function activityGetAll(teamId: number) : Promise<Activities> {
    return (await get<Activities>(getActivitiesId(teamId))) ?? { activities: [], _rev: 0 }
}

export async function activitySaveNew(teamId: number, name: string) {
    let { activities, _rev } = await activityGetAll(teamId)
    await checkDuplicates(activities, name)
    let id = getNewId(activities.map(x => x.id))
    let newActivity = { id, name }
    activities.push(newActivity)
    await set(getActivitiesId(teamId), { activities, _rev })
    return newActivity
}

export async function activitySave(teamId: number, activity: Activity) {
    let { activities, _rev } = await activityGetAll(teamId)
    await checkDuplicates(activities, activity.name)
    let oldActivity = await required(activities.find(x => x.id === activity.id), "Could not find old activity!")
    oldActivity.name = activity.name
    await set(getActivitiesId(teamId), { activities, _rev })
}

export async function activitiesSave(teamId: number, {activities, _rev}: Activities) {
    await areUnique(activities.map(x => x.name))
    await set(getActivitiesId(teamId), { activities, _rev })
}

function getActivitiesId(teamId: number) {
    return `activities:${teamId}`
}

/*** Utilities ***/

function areUnique(xs: string[]) {
    return assert.isTrue(xs.length === new Set(xs.map(x => x.toLowerCase())).size, "Must have unique values!")
}

async function checkDuplicates(xs: {name: string}[], name: string) {
    let o = xs.find(x => equals(x.name, name))
    if (o) {
        return reject(`'${o.name}' already exists.`)
    }
    return
}
