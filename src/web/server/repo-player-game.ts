import { Activities, Activity, get, getMany, PlayerGame, Positions, PositionsV0, set } from "./db.js"
import { teamGet } from "./repo-team.js"
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
        grid: positionsOld.grid,
    }
}

export async function positionsSave(teamId: number, positions: PositionsV0) {
    await areUnique(positions.positions.flat().filter(x => x))
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
    let newValue = { id, name, active: true }
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
    return (await get<Activities>(getActivitiesId(teamId)))
        ?? {
            activities: [
                { id: 1, name: "Goal", active: true },
            ],
            _rev: 0 }
}

export async function activitySaveNew(teamId: number, name: string) {
    let { activities, _rev } = await activityGetAll(teamId)
    let [_, updatedActivities] = await saveNew(activities, name)
    await set(getActivitiesId(teamId), { activities: updatedActivities, _rev } as Activities)
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
