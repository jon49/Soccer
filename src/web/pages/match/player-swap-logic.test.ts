import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { GameState, PlayerGame } from "../../server/db.js";
import { computeSwapAll, getPlayerPosition } from "./player-swap-logic.js";

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

function makeOnDeckPlayer(playerId: number, targetPosition: number | null): PlayerGame {
  return {
    _rev: 0,
    playerId,
    gameId: 1,
    stats: [],
    gameTime: [{ position: `pos-${targetPosition}` }],
    status: { _: "onDeck", targetPosition },
  };
}

function makeInPlayPlayer(
  playerId: number,
  position: number,
  gameTime: PlayerGame["gameTime"] = [],
): PlayerGame {
  return {
    _rev: 0,
    playerId,
    gameId: 1,
    stats: [],
    gameTime,
    status: { _: "inPlay", position },
  };
}

describe("getPlayerPosition", () => {
  it("returns the target position for an on-deck player", () => {
    assert.equal(getPlayerPosition(makeOnDeckPlayer(1, 3)), 3);
  });

  it("returns the position for an in-play player", () => {
    assert.equal(getPlayerPosition(makeInPlayPlayer(1, 2)), 2);
  });

  it("returns null for any other status", () => {
    assert.equal(
      getPlayerPosition({
        _rev: 0,
        playerId: 1,
        gameId: 1,
        stats: [],
        gameTime: [],
        status: { _: "out" },
      }),
      null,
    );
  });
});

describe("computeSwapAll", () => {
  it("moves an on-deck player into an empty position and starts their timer", () => {
    let onDeck = makeOnDeckPlayer(1, 0);
    let gameState = makeGameState();

    let { playersToSave } = computeSwapAll([onDeck], [], gameState);

    assert.deepEqual(onDeck.status, { _: "inPlay", position: 0 });
    assert.deepEqual(playersToSave, [onDeck]);
    assert.equal(typeof onDeck.gameTime.slice(-1)[0].start, "number");
  });

  it("does not start the timer when the game clock isn't running", () => {
    let onDeck = makeOnDeckPlayer(1, 0);
    let gameState = makeGameState({ gameTime: [] });

    computeSwapAll([onDeck], [], gameState);

    assert.equal(onDeck.gameTime.slice(-1)[0].start, undefined);
  });

  it("bumps the in-play player already at that position to out and ends their timer", () => {
    let onDeck = makeOnDeckPlayer(1, 0);
    let occupant = makeInPlayPlayer(2, 0, [{ start: 500, position: "pos-0" }]);
    let gameState = makeGameState();

    let { playersToSave } = computeSwapAll([onDeck], [occupant], gameState);

    assert.deepEqual(occupant.status, { _: "out" });
    assert.equal(typeof occupant.gameTime.slice(-1)[0].end, "number");
    assert.deepEqual(playersToSave, [occupant, onDeck]);
  });

  it("bumps an unstarted in-play occupant to out without trying to end an unstarted interval", () => {
    let onDeck = makeOnDeckPlayer(1, 0);
    let occupant = makeInPlayPlayer(2, 0, [{ position: "pos-0" }]);
    let gameState = makeGameState();

    computeSwapAll([onDeck], [occupant], gameState);

    assert.deepEqual(occupant.status, { _: "out" });
    assert.equal(occupant.gameTime.slice(-1)[0].end, undefined);
  });

  it("processes multiple on-deck players independently", () => {
    let a = makeOnDeckPlayer(1, 0);
    let b = makeOnDeckPlayer(2, 1);
    let gameState = makeGameState();

    let { playersToSave } = computeSwapAll([a, b], [], gameState);

    assert.deepEqual(a.status, { _: "inPlay", position: 0 });
    assert.deepEqual(b.status, { _: "inPlay", position: 1 });
    assert.deepEqual(playersToSave, [a, b]);
  });

  it("throws when an on-deck player has no target position (invariant violation)", () => {
    let onDeck = makeOnDeckPlayer(1, null);
    assert.throws(() => computeSwapAll([onDeck], [], makeGameState()));
  });
});
