import type { GameState, PlayerGame } from "../../server/db.js";
import {
  GameTimeCalculator,
  PlayerGameTimeCalculatorBase,
  isInPlayPlayer,
  isOnDeckPlayer,
} from "./state-logic.js";

export function getPlayerPosition(player: PlayerGame): number | null {
  return isOnDeckPlayer(player)
    ? player.status.targetPosition
    : isInPlayPlayer(player)
      ? player.status.position
      : null;
}

export interface SwapAllOutcome {
  playersToSave: PlayerGame[];
}

// `onDeckPlayers` must already be filtered to players with a non-null
// targetPosition (the route handler does this before calling in). A null
// position here means that filter was skipped, which is a caller bug rather
// than something to validate against at runtime.
export function computeSwapAll(
  onDeckPlayers: PlayerGame[],
  inPlayers: PlayerGame[],
  gameState: GameState,
): SwapAllOutcome {
  let gameCalc = new GameTimeCalculator(gameState);
  let playersToSave: PlayerGame[] = [];

  for (let player of onDeckPlayers) {
    let calc = new PlayerGameTimeCalculatorBase(player, gameCalc);
    let targetPosition = getPlayerPosition(player);

    let currentPlayer = inPlayers.find(
      (x) => isInPlayPlayer(x) && x.status.position === targetPosition,
    );
    if (currentPlayer) {
      let inPlayerCalc = new PlayerGameTimeCalculatorBase(currentPlayer, gameCalc);
      if (inPlayerCalc.hasStarted()) {
        inPlayerCalc.end();
      }
      currentPlayer.status = { _: "out" };
      playersToSave.push(currentPlayer);
    }

    calc.start();

    if (targetPosition == null) {
      throw new Error("Player position number is required!");
    }

    player.status = { _: "inPlay", position: targetPosition };
    playersToSave.push(player);
  }

  return { playersToSave };
}
