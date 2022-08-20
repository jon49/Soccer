import { createCheckbox, createString25, createString50 } from "./validation";

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

export const queryTeamValidator = {
    team: createString25("Query Team ID")
}

export const queryTeamPlayerValidator = {
    ...queryTeamValidator,
    player: createString25("Query Player Name")
}
