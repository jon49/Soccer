import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { GameState, PlayerGame } from "../../server/db.js";
import { GameTimeCalculator } from "./state-logic.js";
import {
  adjustPoints,
  applyInPlayerOut,
  applyOnDeckPlayerOut,
  applyStatOperation,
  endInPlayPlayers,
  isValidPointsValue,
  nextRapidFireTarget,
  pauseInPlayPlayers,
  resetGameStateForDeletedGame,
  resetPlayerForDeletedGame,
  startInPlayPlayers,
} from "./match-page-logic.js";

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    _rev: 0,
    gameId: 1,
    points: 0,
    opponentPoints: 0,
    gameTime: [{ start: 1000 }],
    ...overrides,
  };
}

function makePlayer(playerId: number, overrides: Partial<PlayerGame> = {}): PlayerGame {
  return {
    _rev: 0,
    playerId,
    gameId: 1,
    stats: [],
    gameTime: [],
    ...overrides,
  };
}

describe("adjustPoints / isValidPointsValue", () => {
  it("increments and decrements", () => {
    assert.equal(adjustPoints(3, 1), 4);
    assert.equal(adjustPoints(3, -1), 2);
  });

  it("flags negative results as invalid", () => {
    assert.equal(isValidPointsValue(adjustPoints(0, 1)), true);
    assert.equal(isValidPointsValue(adjustPoints(0, -1)), false);
  });
});

describe("applyStatOperation", () => {
  it("increments the count by 1 point with no game-score side effect", () => {
    let result = applyStatOperation(0, "inc", 1);
    assert.deepEqual(result, { newCount: 1, gameScoreDelta: 0 });
  });

  it("decrements the count by 1 point with no game-score side effect", () => {
    let result = applyStatOperation(2, "dec", 1);
    assert.deepEqual(result, { newCount: 1, gameScoreDelta: 0 });
  });

  it("defaults points to 1 when not given", () => {
    assert.deepEqual(applyStatOperation(0, "inc"), { newCount: 1, gameScoreDelta: 0 });
  });

  it("adds the points beyond the first directly to the game score on increment", () => {
    // e.g. a 3-point activity: +3 to the stat count, +2 to the game score
    // (the first point is assumed to be accounted for elsewhere).
    let result = applyStatOperation(0, "inc", 3);
    assert.deepEqual(result, { newCount: 3, gameScoreDelta: 2 });
  });

  it("subtracts the points beyond the first directly from the game score on decrement", () => {
    let result = applyStatOperation(5, "dec", 3);
    assert.deepEqual(result, { newCount: 2, gameScoreDelta: -2 });
  });
});

describe("nextRapidFireTarget", () => {
  it("finds the first on-deck player without a target position", () => {
    let a = { status: { targetPosition: 0 } };
    let b = { status: { targetPosition: null } };
    let c = { status: { targetPosition: null } };
    assert.equal(nextRapidFireTarget([a, b, c]), b);
  });

  it("returns undefined when every on-deck player already has a target", () => {
    let a = { status: { targetPosition: 0 } };
    assert.equal(nextRapidFireTarget([a]), undefined);
  });
});

describe("applyInPlayerOut / applyOnDeckPlayerOut", () => {
  it("ends a started in-play player's timer and marks them out", () => {
    let player = makePlayer(1, {
      status: { _: "inPlay", position: 0 },
      gameTime: [{ start: 500, position: "GK" }],
    });
    let gameCalc = new GameTimeCalculator(makeGameState());

    applyInPlayerOut(player, gameCalc);

    assert.deepEqual(player.status, { _: "out" });
    assert.equal(typeof player.gameTime[0].end, "number");
  });

  it("discards an unstarted in-play player's open interval entirely", () => {
    let player = makePlayer(1, {
      status: { _: "inPlay", position: 0 },
      gameTime: [{ position: "GK" }],
    });
    let gameCalc = new GameTimeCalculator(makeGameState());

    applyInPlayerOut(player, gameCalc);

    assert.deepEqual(player.status, { _: "out" });
    assert.equal(player.gameTime.length, 0);
  });

  it("marks an on-deck player out and drops their still-open interval", () => {
    let player = makePlayer(1, {
      status: { _: "onDeck", targetPosition: 0 },
      gameTime: [{ position: "GK" }],
    });

    applyOnDeckPlayerOut(player);

    assert.deepEqual(player.status, { _: "out" });
    assert.equal(player.gameTime.length, 0);
  });

  it("keeps a closed interval on an on-deck player when marking them out", () => {
    let player = makePlayer(1, {
      status: { _: "onDeck", targetPosition: 0 },
      gameTime: [{ start: 500, end: 600, position: "GK" }],
    });

    applyOnDeckPlayerOut(player);

    assert.equal(player.gameTime.length, 1);
  });
});

describe("startInPlayPlayers / pauseInPlayPlayers / endInPlayPlayers", () => {
  it("starts only the in-play players' timers", () => {
    let inPlay = makePlayer(1, {
      status: { _: "inPlay", position: 0 },
      gameTime: [{ position: "GK" }],
    });
    let onDeck = makePlayer(2, {
      status: { _: "onDeck", targetPosition: 1 },
      gameTime: [{ position: "DEF" }],
    });
    let gameCalc = new GameTimeCalculator(makeGameState());

    let started = startInPlayPlayers([inPlay, onDeck], gameCalc);

    assert.deepEqual(started, [inPlay]);
    assert.equal(typeof inPlay.gameTime[0].start, "number");
    assert.equal(onDeck.gameTime[0].start, undefined);
  });

  it("pauses in-play players by ending their interval and queuing a fresh one at the same position", () => {
    let player = makePlayer(1, {
      status: { _: "inPlay", position: 0 },
      gameTime: [{ start: 500, position: "GK" }],
    });
    let gameCalc = new GameTimeCalculator(makeGameState());

    let paused = pauseInPlayPlayers([player], gameCalc);

    assert.deepEqual(paused, [player]);
    assert.equal(typeof player.gameTime[0].end, "number");
    let last = player.gameTime.slice(-1)[0];
    assert.equal(last.position, "GK");
    assert.equal(last.start, undefined);
  });

  it("ends in-play players at the given timestamp and marks them out", () => {
    let player = makePlayer(1, {
      status: { _: "inPlay", position: 0 },
      gameTime: [{ start: 500, position: "GK" }],
    });
    let gameCalc = new GameTimeCalculator(makeGameState());
    let now = 9999;

    let ended = endInPlayPlayers([player], gameCalc, now);

    assert.deepEqual(ended, [player]);
    assert.equal(player.gameTime[0].end, now);
    assert.deepEqual(player.status, { _: "out" });
  });
});

describe("resetPlayerForDeletedGame / resetGameStateForDeletedGame", () => {
  it("clears a player's game time, stats, and status", () => {
    let player = makePlayer(1, {
      status: { _: "inPlay", position: 0 },
      gameTime: [{ start: 1, end: 2, position: "GK" }],
      stats: [{ statId: 1, count: 3 }],
    });

    resetPlayerForDeletedGame(player);

    assert.equal(player.gameTime.length, 0);
    assert.equal(player.stats.length, 0);
    assert.equal(player.status, undefined);
  });

  it("clears a game state's status, points, and time", () => {
    let gameState = makeGameState({ status: "ended", points: 4, opponentPoints: 2 });

    resetGameStateForDeletedGame(gameState);

    assert.equal(gameState.status, undefined);
    assert.equal(gameState.points, 0);
    assert.equal(gameState.opponentPoints, 0);
    assert.deepEqual(gameState.gameTime, []);
  });
});
