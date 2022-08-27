import { get, getMany, Player, set, Team, Teams, TeamSingle } from "./db"
import { update } from "./lib/db.min"
import { reject } from "./repo"
import { equals, getNewId } from "./utils"
import { requiredAsync } from "./validation"

export function teamGet(teamId: number) : Promise<Team> {
    return requiredAsync(get<Team>(getTeamDbId(teamId)), `Could not find team with id: "${teamId}".`)
}

export interface WasFiltered {
    filtered?: boolean
}

export async function teamGetAll(all: boolean, wasFiltered?: WasFiltered) : Promise<Team[]> {
    let data = await get("teams")
    if (!data) return []
    let teamsMaybe = await getMany(data?.filter(x => all || x.active).map(x => getTeamDbId(x.id)) ?? [])
    let teams = <Team[]>teamsMaybe.filter(x => x)

    if (wasFiltered) {
        wasFiltered.filtered = data.length !== teams.length
    }

    teams.sort((a, b) =>
        a.year !== b.year
            ? b.year.localeCompare(a.year)
        : a.name.localeCompare(b.name))
    return teams
}

export async function teamSave(o: Team) {
    let teamsAggregate = await teamGetAll(true)
    if (teamsAggregate?.find(x => x.id !== o.id && equals(x.name, o.name) && equals(x.year, o.year))) {
        return reject(`The team "${o.name} - ${o.year}" already exists.`)
    }

    await set<Team>(getTeamDbId(o.id), o)

    await update<Teams>("teams", teams => {
            let teamId =  teams?.findIndex(x => x.id === o.id)
            if (!teams) {
                throw new Error(`Teams doesn't exist. This should never happen!`)
            }
            if (teamId === undefined || teamId === -1) {
                throw new Error(`Could not find team with id: ${o.id}. This should have never happened!`)
            }
            teams[teamId] = o
            return teams
        })
    return
}

interface TeamNew {
    name: string
    year: string
}

export function teamNew(o: TeamSingle): Team {
    return {
        ...o,
        players: [],
        games: [],
        positions: [],
    }
}

export async function teamsCreate(o: TeamNew) : Promise<number> {
    let teamsAggregate = await teamGetAll(true)
    if (teamsAggregate?.find(x => equals(x.name, o.name) && equals(x.year, o.year))) {
        return reject(`The team "${o.name} - ${o.year}" already exists.`)
    }

    let id = getNewId(teamsAggregate.map(x => x.id))

    let teamSingle : TeamSingle = {
        ...o,
        id,
        active: true,
    }
    let team = teamNew(teamSingle)

    await Promise.all([
        update<Teams>("teams", o => {
            if (o) {
                o.push(teamSingle)
            } else {
                return [teamSingle]
            }
            return o
        }),
        set(getTeamDbId(team.id), team)
    ])
    return id
}

export async function playerGetAll(ids: number[]) {
    return (await getMany<Player>(ids))?.filter(x => x) ?? []
}

export async function playerCreate(teamId: number, name: string) : Promise<number> {
    let team = await teamGet(teamId)
    let id = getNewId(team.players.map(x => x.playerId))
    let active = true

    let player : Player = {
        active,
        id,
        name
    }
    team.players.push({
        active: true,
        name,
        playerId: player.id,
    })

    await Promise.all([
        teamSave(team),
        set(getPlayerDbId(teamId, id), player)
    ])

    return player.id
}

function getPlayerDbId(teamId: number, playerId: number) {
    return `player:${teamId}|${playerId}`
}

function getTeamDbId(teamId: number) {
    return `team:${teamId}`
}
