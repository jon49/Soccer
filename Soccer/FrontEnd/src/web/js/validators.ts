import { reject } from "./repo";
import { createCheckbox, createIdNumber, createString25 } from "./validation";

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
    team: number
}

export const queryAllValidator = {
    all: async (val: any) : Promise<null | ""> => {
        if (val === null || val === "") return val
        return reject(`The value "${val}" must be 'null' or and empty string.`)
    }
}

export const queryTeamValidator = {
    team: createIdNumber("Query Team ID")
}

export const queryTeamPlayerValidator = {
    ...queryTeamValidator,
    player: createString25("Query Player Name")
}

export const queryTeamGameValidator = {
    ...queryTeamValidator,
    game: createIdNumber("Query Game ID")
}

export interface QueryTeamGame extends QueryTeam {
    game: number
}
