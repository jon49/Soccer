import { get, set, update, getMany, Team, Teams, TeamSingle } from "./db.js"
import { reject } from "./repo.js"
import { equals, getNewId } from "./utils.js"
import { requiredAsync } from "./validation.js"

export function teamGet(teamId: number) : Promise<Team> {
    return requiredAsync(get<Team>(getTeamDbId(teamId)), `Could not find team with id: "${teamId}".`)
}

export interface WasFiltered {
    filtered?: boolean
}

export async function teamGetAll(all: boolean, wasFiltered?: WasFiltered) : Promise<Team[]> {
    let data = await get("teams")
    if (!data) return []
    let teams_ = data.teams.filter(x => all || x.active)

    if (wasFiltered) {
        wasFiltered.filtered = data.teams.length !== teams_.length
    }

    let teams = await getMany<Team>(teams_.map(x => getTeamDbId(x.id)))

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
            if (!teams) {
                throw new Error(`Teams doesn't exist. This should never happen!`)
            }
            let teamId =  teams?.teams.findIndex(x => x.id === o.id)
            if (teamId === undefined || teamId === -1) {
                throw new Error(`Could not find team with id: ${o.id}. This should have never happened!`)
            }
            teams.teams[teamId] = o
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
        _rev: 0,
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
                o.teams.push(teamSingle)
            } else {
                return {
                    _rev: 0,
                    teams: [teamSingle]
                }
            }
            return o
        }),
        set(getTeamDbId(team.id), team)
    ])
    return id
}

export async function playerCreate(teamId: number, name: string) : Promise<number> {
    let team = await teamGet(teamId)
    let id = getNewId(team.players.map(x => x.id))

    team.players.push({
        active: true,
        name,
        id,
    })

    await teamSave(team)

    return id
}

function getTeamDbId(teamId: number) {
    return `team:${teamId}`
}
