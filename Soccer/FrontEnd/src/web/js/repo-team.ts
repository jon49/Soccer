import { get, getMany, set, Team, Teams, TeamSingle } from "./db"
import { update } from "./lib/db.min"
import { reject } from "./repo"
import { required, requiredAsync } from "./validation"

export function teamGet(id: number | string) {
    return requiredAsync(get<Team>(id.toString()), `Could not find team with id: "${id}".`)
}

export type TeamWithActive = TeamSingle & Team
export async function teamGetWithActive(id: number | string) : Promise<TeamWithActive> {
    let teams = await requiredAsync(get("teams"), "Could not retrieve teams.")
    let team = await teamGet(id)
    let teamsAggregate = required(teams.find(x => x.id = team.id), `Could not find the aggregate team with id: "${id}".`)
    return <TeamWithActive><any>{ ...teamsAggregate, ...team }
}

export interface WasFiltered {
    filtered?: boolean
}

export async function teamGetAll(all: boolean, wasFiltered?: WasFiltered) : Promise<Team[]> {
    let data = await get("teams")
    if (!data) return []
    let teamsMaybe = await getMany(data?.filter(x => all || x.active).map(x => x.id.toString()) ?? [])
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

export async function teamSave(o: Team | TeamWithActive) {
    let teamsAggregate = await teamGetAll(true)
    if (teamsAggregate?.find(x => x.id !== o.id && x.name === o.name && x.year === o.year)) {
        return reject(`The team "${o.name} - ${o.year}" already exists.`)
    }

    let teamToSave : Team = {
        games: o.games,
        id: o.id,
        name: o.name,
        players: o.players,
        year: o.year,
    }
    await set<Team>(o.id.toString(), teamToSave)

    if ("active" in o) {
        await update<Teams>("teams", teams => {
                let team =  teams?.find(x => x.id === o.id)
                if (!team) {
                    throw new Error(`Could not find team with id: ${o.id}. This should have never happened!`)
                }
                team.active = o.active
                return teams ?? []
            })
    }
    return
}

interface TeamNew {
    name: string
    year: string
}

export function teamNew(o: TeamNew & {id: number}): Team {
    return {
        ...o,
        players: [],
        games: []
    }
}

export function teamsNew() : TeamSingle {
    return {
        active: true,
        id: +new Date()
    }
}

export async function teamsCreate(o: TeamNew) : Promise<number> {
    let teamsAggregate = await teamGetAll(true)
    if (teamsAggregate?.find(x => x.name === o.name && x.year === o.year)) {
        return reject(`The team "${o.name} - ${o.year}" already exists.`)
    }
    let teamSingle = teamsNew()
    let id = teamSingle.id
    let team = teamNew({ ...o, id })

    await Promise.all([
        update<Teams>("teams", o => {
            if (o) {
                o.push(teamSingle)
            } else {
                return [teamSingle]
            }
            return o
        }),
        set(id.toString(), team)
    ])
    return id
}
