import type { GameState, PlayerGame, Team } from "../../server/db.js";
import { applySwapToOnDeck, applySwapWhenInGame } from "./player-target-position-logic.js";

let {
  repo: { playerGameAllGet, teamGet, playerGameSave, positionGetAll, gameStateGet },
  validation: { required, queryTeamIdGameIdValidator, createIdNumber, validateObject },
} = self.sw;

const queryTeamGamePlayerValidator = {
  ...queryTeamIdGameIdValidator,
  playerId: createIdNumber("Query Player Id"),
};

export default async function targetPosition(query: any, targetPosition: number) {
  let { gameId, playerId, teamId } = await validateObject(query, queryTeamGamePlayerValidator);

  let [team, players] = await Promise.all([
    teamGet(teamId),
    playerGameAllGet(teamId, gameId, [playerId]),
  ]);
  let game = await required(
    team.games.find((x) => x.id === gameId),
    "Could not find game ID!",
  );
  let gameState = await gameStateGet(teamId, gameId, game);
  let player = await required(
    players.find((x) => x.playerId === playerId),
    "Could not find player ID!",
  );

  await _targetPosition(player, team, gameState, targetPosition);
}

async function _targetPosition(
  player: PlayerGame,
  team: Team,
  gameState: GameState,
  targetPosition: number,
) {
  let [players, { positions }] = await Promise.all([
    playerGameAllGet(team.id, gameState.gameId, []),
    positionGetAll(team.id),
  ]);
  let positionNames = positions.flat();

  let inGame = applySwapWhenInGame(player, players, positionNames, targetPosition, gameState);
  let onDeck = applySwapToOnDeck(player, players, positionNames, targetPosition, gameState);

  for (let toSave of [...inGame.playersToSave, ...onDeck.playersToSave]) {
    await playerGameSave(team.id, toSave);
  }
}
