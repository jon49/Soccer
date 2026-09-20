import { isInPlayPlayer, isOnDeckPlayer } from "./shared.js";
import { computeSwapAll } from "./player-swap-logic.js";

let {
  repo: { playerGameAllGet, teamGet, gameStateGet, playerGameSave },
  validation: { maybe, required, queryTeamIdGameIdValidator, createIdNumber, validateObject },
} = self.sw;

const queryTeamGamePlayerValidator = {
  ...queryTeamIdGameIdValidator,
  playerId: maybe(createIdNumber("Query Player Id")),
};

export async function swapAll(query: any) {
  let { gameId, playerId, teamId } = await validateObject(query, queryTeamGamePlayerValidator);

  let team = await teamGet(teamId);
  let players = await playerGameAllGet(
    teamId,
    gameId,
    team.players.map((x) => x.id),
  );
  let inPlayers = players.filter(isInPlayPlayer);
  let onDeckPlayers = players
    .filter(isOnDeckPlayer)
    .filter((x) => (playerId ? x.playerId === playerId : true))
    .filter((x) => x.status.targetPosition != null);
  let game = await required(
    team.games.find((x) => x.id === gameId),
    "Could not find game ID!",
  );
  let gameState = await gameStateGet(teamId, gameId, game);

  let { playersToSave } = computeSwapAll(onDeckPlayers, inPlayers, gameState);
  for (let player of playersToSave) {
    await playerGameSave(teamId, player);
  }
}
