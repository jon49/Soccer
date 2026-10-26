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
  type TeamId,
} from "./db.js";
import { settings } from "./global-model.js";
import { isMovedTeam, type MovedTeam } from "./share-logic.js";
import { equals, getNewId, getNewTeamId } from "./utils.js";
import { required, reject } from "@jon49/sw/validation.js";

// Shared teams use their space uuid as the team id; personal teams use a
// number.
export function isSharedTeamId(teamId: TeamId): teamId is string {
  return typeof teamId === "string";
}

export async function teamGet(teamId: TeamId): Promise<Team> {
  let team = await required(
    await get<Team | MovedTeam>(getTeamDbId(teamId)),
    `Could not find team with id: "${teamId}".`,
  );
  if (isMovedTeam(team)) {
    return reject("This team is now a shared team. Open it from the teams list.");
  }
  return team;
}

// Personal teams are listed in the "teams" doc. Shared teams aren't: they're
// every space we're in, skipping any whose team record hasn't synced down yet.
export async function teamGetAll(
  active: "all" | "active" | "inactive",
): Promise<{ teams: Team[]; total: number }> {
  let [data, { spaces }] = await Promise.all([get("teams"), settings()]);
  let ids: TeamId[] = [...(data?.teams ?? []).map((x) => x.id), ...Object.keys(spaces ?? {})];
  let all = (await getMany<Team | undefined>(ids.map(getTeamDbId))).filter((x): x is Team => !!x);

  let teams = all.filter((x) => active === "all" || x.active === (active === "active"));
  teams.sort((a, b) =>
    a.year !== b.year ? b.year.localeCompare(a.year) : a.name.localeCompare(b.name),
  );
  return { teams, total: all.length };
}

interface GameNotes extends Revision {
  notes: string;
}

export async function saveGameNotes(teamId: TeamId, gameId: number, notes: string) {
  let gameNotes = await getGameNotes(teamId, gameId);
  gameNotes.notes = notes;
  await set(getGameNotesId(teamId, gameId), gameNotes);
}

export async function getGameNotes(teamId: TeamId, gameId: number): Promise<GameNotes> {
  let notes = await get<GameNotes>(getGameNotesId(teamId, gameId));
  return notes ?? { notes: "", _rev: 0 };
}

function getGameNotesId(teamId: TeamId, gameId: number) {
  return ["game-notes", teamId, gameId];
}

/*** Game state (live, frequently-changing slice of a game) ***/

function getGameStateId(teamId: TeamId, gameId: number) {
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
  teamId: TeamId,
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

export async function gameStateSave(teamId: TeamId, gameState: GameState) {
  await set(getGameStateId(teamId, gameState.gameId), gameState);
}

// Batch loader for list views (e.g. stats). Falls back to legacy game fields
// for any game without its own record yet.
export async function gameStatesGet(teamId: TeamId, games: Game[]): Promise<GameState[]> {
  let records = await getMany<GameState>(games.map((x) => getGameStateId(teamId, x.id)));
  return records.map((record, i) => record ?? gameStateFromLegacy(games[i].id, games[i]));
}

export async function teamSave(o: Team) {
  let teamsAggregate = await teamGetAll("all");
  let current = teamsAggregate.teams.find((x) => x.id === o.id);
  // Only a rename can create a duplicate. Joining a shared team can bring in
  // one with the same name as a personal team, and that mustn't block saving
  // either of them.
  let renamed = !current || !equals(current.name, o.name) || !equals(current.year, o.year);
  if (
    renamed &&
    teamsAggregate.teams.find(
      (x) => x.id !== o.id && equals(x.name, o.name) && equals(x.year, o.year),
    )
  ) {
    return reject(`The team "${o.name} - ${o.year}" already exists.`);
  }

  await set<Team>(getTeamDbId(o.id), o);
  if (isSharedTeamId(o.id)) return;

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

  let id = getNewTeamId(await get("teams"));

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

export async function playerCreate(teamId: TeamId, name: string): Promise<TeamPlayer> {
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

function getTeamDbId(teamId: TeamId) {
  return ["team", teamId];
}
