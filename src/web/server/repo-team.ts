import { get, set, update, getMany, Team, Teams, TeamSingle, Revision, TeamPlayer } from "./db.js"
import { reject } from "./repo.js"
import { equals, getNewId } from "./utils.js"
import { required } from "./validation.js"

export async function teamGet(teamId: number) : Promise<Team> {
    return required(await get<Team>(getTeamDbId(teamId)), `Could not find team with id: "${teamId}".`)
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

interface GameNotes extends Revision {
    notes: string
}

export async function saveGameNotes(teamId: number, gameId: number, notes: string) {
    let gameNotes = await getGameNotes(teamId, gameId)
    gameNotes.notes = notes
    await set(getGameNotesId(teamId, gameId), gameNotes)
}

export async function getGameNotes(teamId: number, gameId: number) : Promise<GameNotes> {
    let notes = await get<GameNotes>(getGameNotesId(teamId, gameId))
    return notes ?? { notes: "", _rev: 0 }
}

function getGameNotesId(teamId: number, gameId: number) {
    return ["game-notes", teamId, gameId]
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
            teams.teams[teamId] = {
                id: o.id,
                name: o.name,
                year: o.year,
                active: o.active,
            }
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
        grid: [],
        _v: 0,
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
            const teamsSingle = {
                    id,
                    name: team.name,
                    year: team.year,
                    active: team.active,
            }
            if (o) {
                o.teams.push(teamsSingle)
            } else {
                return {
                    _rev: 0,
                    teams: [teamsSingle]
                }
            }
            return o
        }),
        set(getTeamDbId(team.id), team)
    ])
    return id
}

export async function playerCreate(teamId: number, name: string) : Promise<TeamPlayer> {
    let team = await teamGet(teamId)
    let id = getNewId(team.players.map(x => x.id))

    let player = {
        active: true,
        name,
        id,
    }
    team.players.push(player)

    await teamSave(team)

    return player
}

function getTeamDbId(teamId: number) {
    return ["team", teamId]
}
