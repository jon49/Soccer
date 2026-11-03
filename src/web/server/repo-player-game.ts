import { Stats, Stat, get, getMany, PlayerGame, Positions, set, type TeamId } from "./db.js";
import { teamGet } from "./repo-team.js";
import { reject } from "@jon49/sw/validation.js";

function getPlayerGameKey(teamId: TeamId, gameId: number, playerId: number) {
  return ["player-game", teamId, playerId, gameId];
}

export async function playerGameSave(teamId: TeamId, playerGame: PlayerGame) {
  await set(getPlayerGameKey(teamId, playerGame.gameId, playerGame.playerId), playerGame);
}

export async function playerGameAllGet(teamId: TeamId, gameId: number, playerIds: number[]) {
  if (playerIds.length === 0) {
    playerIds = await teamGet(teamId).then((x) => x.players.map((x) => x.id));
  }
  let playersGame = await getMany<PlayerGame>(
    playerIds.map((x) => getPlayerGameKey(teamId, gameId, x)),
  );
  for (let i = 0; i < playersGame.length; i++) {
    if (!playersGame[i]) {
      playersGame[i] = {
        gameId,
        gameTime: [],
        playerId: playerIds[i],
        stats: [],
        _rev: 0,
      };
    }
  }
  return playersGame;
}

/*** Positions ***/

function getPositionsId(teamId: TeamId) {
  return ["positions", teamId];
}

export async function positionGetAll(teamId: TeamId): Promise<Positions> {
  return (await get<Positions>(getPositionsId(teamId))) ?? { _rev: 0, _v: 0, positions: [] };
}

export async function positionsSave(teamId: TeamId, positions: Positions) {
  await areUnique(positions.positions.flat().filter((x) => x));
  await set(getPositionsId(teamId), positions);
}

/*** Stats ***/

export const statDescriptions = {
  Goal: "The number of times a player scores.",
};

export const statIds: Record<StatName, number> = <any>Object.keys(statDescriptions).reduce(
  (acc, key, i) => {
    acc[key] = i + 1;
    return acc;
  },
  {} as { [key: string]: number },
);

export function getStatDescription(id: number) {
  let statName = Object.keys(statDescriptions)[id - 1];
  // @ts-ignore
  return statDescriptions[statName];
}

export type StatName = keyof typeof statDescriptions;

export async function statsGetAll(teamId: TeamId): Promise<Stats> {
  return (
    (await get<Stats>(getStatsId(teamId))) ?? {
      stats: Object.keys(statDescriptions).map((x, i) => ({
        id: i + 1,
        name: x,
        active: true,
      })),
      _rev: 0,
    }
  );
}

export async function statSave(teamId: TeamId, stat: Stat) {
  let { stats, _rev } = await statsGetAll(teamId);

  let index = stats.findIndex((x) => x.id === stat.id);
  if (index > -1) {
    stats[index] = stat;
  } else {
    return reject("Stat not found.");
  }

  await statsSave(teamId, { stats, _rev });
}

export async function statsSave(teamId: TeamId, { stats, _rev }: Stats) {
  await areUnique(stats.map((x) => x.name));
  await set(getStatsId(teamId), { stats, _rev } as Stats);
}

function getStatsId(teamId: TeamId) {
  return ["stats", teamId];
}

/*** Utilities ***/

function areUnique(xs: string[]) {
  let result = findDuplicateCaseInsensitive(xs);
  if (result) {
    return reject(`'${result[0]}' and '${result[1]}' are the same. Values must be unique!`);
  }
  return;
}

function findDuplicateCaseInsensitive(arr: string[]) {
  const lowercaseMap = new Map();

  for (const value of arr) {
    const lowercaseValue = value.toLowerCase();

    if (lowercaseMap.has(lowercaseValue)) {
      // Found a duplicate
      return [value, lowercaseMap.get(lowercaseValue)];
    } else {
      lowercaseMap.set(lowercaseValue, value);
    }
  }

  // No duplicates found
  return null;
}
