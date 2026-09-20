import type { GameState, PlayerGame } from "../../server/db.js";
import {
  GameTimeCalculator,
  PlayerGameTimeCalculatorBase,
  isInPlayPlayer,
  isOnDeckPlayer,
} from "./state-logic.js";

export interface TargetPositionOutcome {
  playersToSave: PlayerGame[];
}

// A player who is currently on-deck, out, or has no status yet can be
// (re)targeted at an on-deck slot. Bumps whoever already held that slot back
// to "out".
export function applySwapToOnDeck(
  player: PlayerGame,
  players: PlayerGame[],
  positions: string[],
  targetPosition: number,
  gameState: GameState,
): TargetPositionOutcome {
  if (!(player.status?._ === "onDeck" || player.status?._ === "out" || !player.status?._)) {
    return { playersToSave: [] };
  }

  let playersToSave: PlayerGame[] = [];

  let onDeckPlayer = players
    .filter(isOnDeckPlayer)
    .find((x) => x.status.targetPosition === targetPosition);
  if (onDeckPlayer) {
    (<PlayerGame>onDeckPlayer).status = { _: "out" };
    playersToSave.push(onDeckPlayer);
  }

  player.status = { _: "onDeck", targetPosition };
  let playerCalc = new PlayerGameTimeCalculatorBase(player, new GameTimeCalculator(gameState));
  if (isOnDeckPlayer(player)) {
    playerCalc.position(positions[targetPosition]);
  }
  playersToSave.push(player);

  return { playersToSave };
}

// A player who is currently in play moves to a new position, swapping with
// whoever already occupies that position (if anyone). While the game clock
// is running, both players' current time interval is closed out and a new
// one started at the new position; while paused, only the recorded position
// changes.
export function applySwapWhenInGame(
  player: PlayerGame,
  players: PlayerGame[],
  positions: string[],
  targetPosition: number,
  gameState: GameState,
): TargetPositionOutcome {
  if (player.status?._ !== "inPlay") return { playersToSave: [] };

  let inGamePlayer = players
    .filter(isInPlayPlayer)
    .find((x) => x.status.position === targetPosition);

  if (inGamePlayer) {
    inGamePlayer.status.position = player.status.position;
  }
  player.status.position = targetPosition;

  let gameCalc = new GameTimeCalculator(gameState);
  let playerCalc = new PlayerGameTimeCalculatorBase(player, gameCalc);
  let gameOn = playerCalc.isGameOn();

  let positionName = positions[targetPosition];
  if (gameOn) {
    playerCalc.end();
    playerCalc.position(positionName);
    playerCalc.start();
  } else {
    playerCalc.position(positionName);
  }

  let playersToSave = [player];
  if (inGamePlayer) {
    let inGamePlayerCalc = new PlayerGameTimeCalculatorBase(inGamePlayer, gameCalc);
    // `inGamePlayer.status.position` was set above to player's old position
    // (the slot they inherit) — not `player.status.position`, which is now
    // player's *new* position (the slot they came from getting swapped OUT
    // of by player, not the one they landed on).
    let inGamePositionName = positions[inGamePlayer.status.position];
    if (gameOn) {
      inGamePlayerCalc.end();
      inGamePlayerCalc.position(inGamePositionName);
      inGamePlayerCalc.start();
    } else {
      inGamePlayerCalc.position(inGamePositionName);
    }
    playersToSave.push(inGamePlayer);
  }

  return { playersToSave };
}
