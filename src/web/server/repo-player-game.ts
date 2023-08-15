import { Activities, Activity, get, getMany, PlayerGame, Position, Positions, set } from "./db.js"
import { reject } from "./repo.js"
import { equals, getNewId } from "./utils.js"
import { assert, required } from "./validation.js"

function getPlayerGameKey(teamId: number, gameId: number, playerId: number) {
    return ['player-game', teamId, playerId, gameId]
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

/*** Positions ***/

function getPositionsId(teamId: number) {
    return ["positions", teamId]
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

export async function positionSaveNew(teamId: number, name: string) {
    let { positions, _rev } = await positionGetAll(teamId)
    let [newPosition, updatedPositions] = await saveNew(positions, name)
    await set(getPositionsId(teamId), { positions: updatedPositions, _rev } as Positions)
    return newPosition
}

export async function positionSave(teamId: number, position: Position) {
    let { positions, _rev } = await positionGetAll(teamId)
    await save(positions, position)
    await set(getPositionsId(teamId), { positions, _rev } as Positions)
}

export async function positionsSave(teamId: number, positions: Positions) {
    await areUnique(positions.positions.map(x => x.name))
    await set(getPositionsId(teamId), positions)
}

/*** id/name ***/

interface IdName {
    name: string
    id: number
}

async function saveNew(xs: IdName[], name: string) : Promise<[IdName, IdName[]]> {
    await checkDuplicates(xs, name)
    let id = getNewId(xs.map(x => x.id))
    let newValue = { id, name }
    xs.push(newValue)
    return [newValue, xs]
}

async function save(xs: IdName[], x: IdName) {
    await checkDuplicates(xs, x.name)
    let oldValue = await required(xs.find(x => x.id === x.id), "Could not find old value!")
    oldValue.name = x.name
}

/*** Activities ***/

export async function activityGetAll(teamId: number) : Promise<Activities> {
    return (await get<Activities>(getActivitiesId(teamId))) ?? { activities: [], _rev: 0 }
}

export async function activitySaveNew(teamId: number, name: string) {
    let { activities, _rev } = await activityGetAll(teamId)
    let [newActivity, updatedActivities] = await saveNew(activities, name)
    await set(getActivitiesId(teamId), { activities: updatedActivities, _rev } as Activities)
    return newActivity
}

export async function activitySave(teamId: number, activity: Activity) {
    let { activities, _rev } = await activityGetAll(teamId)
    await save(activities, activity)
    await set(getActivitiesId(teamId), { activities, _rev } as Activities)
}

export async function activitiesSave(teamId: number, {activities, _rev}: Activities) {
    await areUnique(activities.map(x => x.name))
    await set(getActivitiesId(teamId), { activities, _rev } as Activities)
}

function getActivitiesId(teamId: number) {
    return ["activities", teamId]
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
