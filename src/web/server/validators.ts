import {
  reject,
  createCheckbox,
  createIdNumber,
  createString25,
  maybe,
} from "@jon49/sw/validation.js";
import type { TeamId } from "./db.js";

export const dataTeamNameYearValidator = {
  name: createString25("Team Name"),
  year: createString25("Team Year"),
};

export const dataTeamNameYearActiveValidator = {
  ...dataTeamNameYearValidator,
  active: createCheckbox,
};

export const dataPlayerNameValidator = {
  name: createString25("Player Name"),
};

export const dataPlayerNameActiveValidator = {
  ...dataPlayerNameValidator,
  active: createCheckbox,
  number: maybe(createIdNumber("Player Number")),
};

export const queryAllValidator = {
  all: async (val: any): Promise<null | ""> => {
    if (val === null || val === "") return val;
    return reject(`The value "${val}" must be 'null' or and empty string.`);
  },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A personal team's id is a positive integer; a shared team's is its space
// uuid (see `TeamId`).
export function createTeamId(name: string) {
  return async (val: number | string): Promise<TeamId> =>
    typeof val === "string" && UUID.test(val) ? val.toLowerCase() : createIdNumber(name)(val);
}

export const queryTeamIdValidator = {
  teamId: createTeamId("Query Team ID"),
};

export const queryTeamIdPlayerIdValidator = {
  ...queryTeamIdValidator,
  playerId: createIdNumber("Query Player ID"),
};

export const queryTeamIdGameIdValidator = {
  ...queryTeamIdValidator,
  gameId: createIdNumber("Query Game ID"),
};

export const dataPositionValidator = {
  position: createString25("Position"),
};

export const queryTeamIdPositionIdValidator = {
  ...queryTeamIdValidator,
  positionId: createIdNumber("Position ID"),
};
