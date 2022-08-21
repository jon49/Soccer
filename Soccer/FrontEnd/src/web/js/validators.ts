import { createCheckbox, createString25 } from "./validation";

export const dataTeamNameYearValidator = {
    name: createString25("Team Name"),
    year: createString25("Team Year"),
}

export const dataTeamNameYearActiveValidator = {
    ...dataTeamNameYearValidator,
    active: createCheckbox
}

export const dataPlayerNameValidator = {
    name: createString25("Player Name")
}

export const dataPlayerNameActiveValidator = {
    ...dataPlayerNameValidator,
    active: createCheckbox
}

export interface QueryTeam {
    team: string
}

export const queryTeamValidator = {
    team: createString25("Query Team ID")
}

export const queryTeamPlayerValidator = {
    ...queryTeamValidator,
    player: createString25("Query Player Name")
}

export const queryTeamGameValidator = {
    ...queryTeamValidator,
    game: createString25("Query Game ID")
}

export interface QueryTeamGame extends QueryTeam {
    game: string
}
