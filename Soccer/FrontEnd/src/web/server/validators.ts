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

export const queryAllValidator = {
    all: async (val: any) : Promise<null | ""> => {
        if (val === null || val === "") return val
        return reject(`The value "${val}" must be 'null' or and empty string.`)
    }
}

export const queryTeamIdValidator = {
    teamId: createIdNumber("Query Team ID")
}

export const queryTeamIdPlayerIdValidator = {
    ...queryTeamIdValidator,
    playerId: createIdNumber("Query Player ID")
}

export const queryTeamIdGameIdValidator = {
    ...queryTeamIdValidator,
    gameId: createIdNumber("Query Game ID")
}

export const dataPositionValidator = {
    position: createString25("Position")
}

export const queryTeamIdPositionIdValidator = {
    ...queryTeamIdValidator,
    positionId: createIdNumber("Position ID")
}
