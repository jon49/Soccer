import { Message, set, Team, Teams } from "./db";
import html from "./html-template-tag";

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
        players: []
    }
}

export function messageView(message: Message) {
    let m = <string[] | undefined>(message && typeof message === "string" ? [message] : message)
    return m?.map(x => html`<p class=error>${x}</p>`)
}

export function when<T>(b: boolean, s: T) {
    return b ? s : void 0
}
