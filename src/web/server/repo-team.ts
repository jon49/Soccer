import {
  get,
  set,
  update,
  getMany,
  Game,
  GameState,
  Team,
  Teams,
  TeamSingle,
  Revision,
  TeamPlayer,
} from "./db.js";
import { equals, getNewId } from "./utils.js";
import { required, reject } from "@jon49/sw/validation.js";

export async function teamGet(teamId: number): Promise<Team> {
  return required(
    await get<Team>(getTeamDbId(teamId)),
    `Could not find team with id: "${teamId}".`,
  );
}

export async function teamGetAll(
  active: "all" | "active" | "inactive",
): Promise<{ teams: Team[]; total: number }> {
  let data = await get("teams");
  if (!data) return { teams: [], total: 0 };
  let teams_ = data.teams.filter((x) => active === "all" || x.active === (active === "active"));

  let teams = await getMany<Team>(teams_.map((x) => getTeamDbId(x.id)));

  teams.sort((a, b) =>
    a.year !== b.year ? b.year.localeCompare(a.year) : a.name.localeCompare(b.name),
  );
  return { teams, total: data.teams.length };
}

interface GameNotes extends Revision {
  notes: string;
}

export async function saveGameNotes(teamId: number, gameId: number, notes: string) {
  let gameNotes = await getGameNotes(teamId, gameId);
  gameNotes.notes = notes;
  await set(getGameNotesId(teamId, gameId), gameNotes);
}

export async function getGameNotes(teamId: number, gameId: number): Promise<GameNotes> {
  let notes = await get<GameNotes>(getGameNotesId(teamId, gameId));
  return notes ?? { notes: "", _rev: 0 };
}

function getGameNotesId(teamId: number, gameId: number) {
  return ["game-notes", teamId, gameId];
}

/*** Game state (live, frequently-changing slice of a game) ***/

function getGameStateId(teamId: number, gameId: number) {
  return ["game-state", teamId, gameId];
}

function gameStateFromLegacy(gameId: number, game?: Game): GameState {
  return {
    gameId,
    status: game?.status,
    points: game?.points ?? 0,
    opponentPoints: game?.opponentPoints ?? 0,
    gameTime: game?.gameTime ?? [],
    _rev: 0,
  };
}

// Returns the separate game-state record if it exists, otherwise falls back to
// the legacy fields still embedded in the team's game (non-destructive
// migration). Pass `game` to avoid an extra team read when it's already loaded.
export async function gameStateGet(
  teamId: number,
  gameId: number,
  game?: Game,
): Promise<GameState> {
  let existing = await get<GameState>(getGameStateId(teamId, gameId));
  if (existing) return existing;
  if (!game) {
    game = (await teamGet(teamId)).games.find((x) => x.id === gameId);
  }
  return gameStateFromLegacy(gameId, game);
}

export async function gameStateSave(teamId: number, gameState: GameState) {
  await set(getGameStateId(teamId, gameState.gameId), gameState);
}

// Batch loader for list views (e.g. stats). Falls back to legacy game fields
// for any game without its own record yet.
export async function gameStatesGet(teamId: number, games: Game[]): Promise<GameState[]> {
  let records = await getMany<GameState>(games.map((x) => getGameStateId(teamId, x.id)));
  return records.map((record, i) => record ?? gameStateFromLegacy(games[i].id, games[i]));
}

export async function teamSave(o: Team) {
  let teamsAggregate = await teamGetAll("all");
  if (
    teamsAggregate.teams.find(
      (x) => x.id !== o.id && equals(x.name, o.name) && equals(x.year, o.year),
    )
  ) {
    return reject(`The team "${o.name} - ${o.year}" already exists.`);
  }

  await set<Team>(getTeamDbId(o.id), o);

  await update<Teams>("teams", (teams) => {
    if (!teams) {
      throw new Error(`Teams doesn't exist. This should never happen!`);
    }
    let teamId = teams?.teams.findIndex((x) => x.id === o.id);
    if (teamId === undefined || teamId === -1) {
      throw new Error(`Could not find team with id: ${o.id}. This should have never happened!`);
    }
    teams.teams[teamId] = {
      id: o.id,
      name: o.name,
      year: o.year,
      active: o.active,
    };
    return teams;
  });
  return;
}

interface TeamNew {
  name: string;
  year: string;
}

export function teamNew(o: TeamSingle): Team {
  return {
    ...o,
    players: [],
    games: [],
    positions: [],
    _rev: 0,
    _v: 0,
  };
}

export async function teamsCreate(o: TeamNew): Promise<Team> {
  let teamsAggregate = (await teamGetAll("all")).teams;
  if (teamsAggregate.find((x) => equals(x.name, o.name) && equals(x.year, o.year))) {
    return reject(`The team "${o.name} - ${o.year}" already exists.`);
  }

  let id = getNewId(teamsAggregate.map((x) => x.id));

  let teamSingle: TeamSingle = {
    ...o,
    id,
    active: true,
  };
  let team = teamNew(teamSingle);

  await Promise.all([
    update<Teams>("teams", (o) => {
      const teamsSingle = {
        id,
        name: team.name,
        year: team.year,
        active: team.active,
      };
      if (o) {
        o.teams.push(teamsSingle);
      } else {
        return {
          _rev: 0,
          teams: [teamsSingle],
        };
      }
      return o;
    }),
    set(getTeamDbId(team.id), team),
  ]);
  return team;
}

export async function playerCreate(teamId: number, name: string): Promise<TeamPlayer> {
  let team = await teamGet(teamId);
  let id = getNewId(team.players.map((x) => x.id));

  let player = {
    active: true,
    name,
    id,
  };
  team.players.push(player);

  await teamSave(team);

  return player;
}

function getTeamDbId(teamId: number) {
  return ["team", teamId];
}
