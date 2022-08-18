import { get, getMany, Message, set, Team, Teams, TeamSingle } from "./db";
import html from "./html-template-tag";
import { getProperty } from "./utils";
import { required, requiredAsync } from "./validation";

export function getNormalizedTeamName(team: {name: string, year: string}) {
    return `${team.name}|${team.year}`
}

export function findTeamSingle(teams: Teams, team: { name: string, year: string }) {
    return teams.find(x => x.name === team.name && x.year === team.year)
}

export function getURITeamComponent(team: {name: string, year: string}) {
    return encodeURIComponent(getNormalizedTeamName(team))
}

export function splitTeamName(value: string) {
    let s = value.split("|")
    return {
        name: s[0],
        year: s[1],
    }
}

export async function saveTeam(team: Team) {
    return set(getNormalizedTeamName(team), team)
}

export function createTeam({ name, year }: {name: string, year: string}): Team {
    return {
        name,
        year,
        players: [],
        games: []
    }
}

export function messageView(message: Message) {
    let m = <string[] | undefined>(message && typeof message === "string" ? [message] : message)
    return m?.map(x => html`<p class=error>${x}</p>`)
}

export function when<T>(b: any, s: T) {
    return b
        ? s
    : typeof s === "string"
        ? ""
    : null
}

export function whenF<T extends any>(b: T | undefined, f: (b: T) => any) {
    return b
        ? f(b)
    : null
}

export async function getOrCreateTeam(teamQueryName: string) {
    let team = await get<Team>(teamQueryName)
    if (!team) {
        let teams = await requiredAsync(get("teams"))
        let teamSplit = splitTeamName(teamQueryName)
        let team_ = await required(findTeamSingle(teams, teamSplit), `Cannot find team "${teamSplit.name} - ${teamSplit.year}"`)
        team = createTeam(team_)
        return team
    }
    return team
}

export async function getOrCreateTeamMany(teamSingles: TeamSingle[] | undefined) {
    if (!teamSingles) return []
    let teams = await getMany<Team>(teamSingles.map(getNormalizedTeamName))
    return teams.map((x, i) =>
        !x
            ? createTeam(teamSingles[i])
        : x
    )
}
    
