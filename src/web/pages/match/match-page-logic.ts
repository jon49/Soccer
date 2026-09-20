import type { GameState, GameTime, PlayerGame } from "../../server/db.js";
import { GameTimeCalculator, PlayerGameTimeCalculatorBase, isInPlayPlayer } from "./state-logic.js";

// --- points -----------------------------------------------------------

export function adjustPoints(current: number, delta: 1 | -1): number {
  return current + delta;
}

export function isValidPointsValue(points: number): boolean {
  return points >= 0;
}

// --- player stat counts -------------------------------------------------

export interface StatOperationResult {
  newCount: number;
  // Only the portion of `points` beyond the first is added directly to the
  // game score — the first point is assumed to already be accounted for
  // elsewhere (e.g. a goal's own point-scoring flow).
  gameScoreDelta: number;
}

export function applyStatOperation(
  currentCount: number,
  operation: "inc" | "dec",
  points: number = 1,
): StatOperationResult {
  let sign = operation === "inc" ? 1 : -1;
  let newCount = currentCount + sign * points;
  let gameScoreDelta = points > 1 ? sign * (points - 1) : 0;
  return { newCount, gameScoreDelta };
}

// --- rapid fire -----------------------------------------------------------

export function nextRapidFireTarget<T extends { status: { targetPosition: number | null } }>(
  onDeckPlayers: T[],
): T | undefined {
  return onDeckPlayers.find((x) => x.status.targetPosition == null);
}

// --- player-out transitions -------------------------------------------------

export function applyInPlayerOut(player: PlayerGame, gameCalc: GameTimeCalculator): void {
  player.status = { _: "out" };
  new PlayerGameTimeCalculatorBase(player, gameCalc).playerOut();
}

export function applyOnDeckPlayerOut(player: PlayerGame): void {
  player.status = { _: "out" };
  if (player.gameTime.slice(-1)[0]?.end == null) {
    player.gameTime.pop();
  }
}

// --- game start/pause/end ------------------------------------------------

export function startInPlayPlayers(
  players: PlayerGame[],
  gameCalc: GameTimeCalculator,
): PlayerGame[] {
  let inPlayPlayers = players.filter(isInPlayPlayer);
  for (let player of inPlayPlayers) {
    new PlayerGameTimeCalculatorBase(player, gameCalc).start();
  }
  return inPlayPlayers;
}

export function pauseInPlayPlayers(
  players: PlayerGame[],
  gameCalc: GameTimeCalculator,
): PlayerGame[] {
  let inPlayPlayers = players.filter(isInPlayPlayer);
  for (let player of inPlayPlayers) {
    let calc = new PlayerGameTimeCalculatorBase(player, gameCalc);
    let currentPosition = calc.currentPosition();
    calc.end();
    calc.position(currentPosition as string);
  }
  return inPlayPlayers;
}

export function endInPlayPlayers(
  players: PlayerGame[],
  gameCalc: GameTimeCalculator,
  now: number,
): PlayerGame[] {
  let inPlayPlayers = players.filter(isInPlayPlayer);
  for (let player of inPlayPlayers) {
    let calc = new PlayerGameTimeCalculatorBase(player, gameCalc);
    calc.end(now);
    (<PlayerGame>player).status = { _: "out" };
  }
  return inPlayPlayers;
}

// --- delete game -----------------------------------------------------------

export function resetPlayerForDeletedGame(player: PlayerGame): void {
  player.gameTime.length = 0;
  player.stats.length = 0;
  player.status = void 0;
}

export function resetGameStateForDeletedGame(gameState: GameState): void {
  gameState.status = void 0;
  gameState.points = 0;
  gameState.opponentPoints = 0;
  gameState.gameTime = [] as GameTime[];
}
