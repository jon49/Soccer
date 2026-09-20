import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { GameState, PlayerGame } from "../../server/db.js";
import { applySwapToOnDeck, applySwapWhenInGame } from "./player-target-position-logic.js";

const POSITIONS = ["GK", "DEF", "MID", "FWD"];

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

describe("applySwapToOnDeck", () => {
  it("moves an out player onto an empty on-deck slot", () => {
    let player = makePlayer(1, { status: { _: "out" } });
    let { playersToSave } = applySwapToOnDeck(player, [], POSITIONS, 1, makeGameState());

    assert.deepEqual(player.status, { _: "onDeck", targetPosition: 1 });
    assert.deepEqual(playersToSave, [player]);
    assert.deepEqual(player.gameTime.slice(-1)[0], { position: "DEF" });
  });

  it("moves a player with no status yet onto an on-deck slot", () => {
    let player = makePlayer(1);
    let { playersToSave } = applySwapToOnDeck(player, [], POSITIONS, 0, makeGameState());

    assert.deepEqual(player.status, { _: "onDeck", targetPosition: 0 });
    assert.deepEqual(playersToSave, [player]);
  });

  it("bumps whoever already holds that on-deck slot to out", () => {
    let incoming = makePlayer(1, { status: { _: "out" } });
    let occupant = makePlayer(2, {
      status: { _: "onDeck", targetPosition: 1 },
      gameTime: [{ position: "DEF" }],
    });

    let { playersToSave } = applySwapToOnDeck(incoming, [occupant], POSITIONS, 1, makeGameState());

    assert.deepEqual(occupant.status, { _: "out" });
    assert.deepEqual(playersToSave, [occupant, incoming]);
  });

  it("does nothing when the player is currently in play", () => {
    let player = makePlayer(1, { status: { _: "inPlay", position: 0 } });
    let { playersToSave } = applySwapToOnDeck(player, [], POSITIONS, 1, makeGameState());

    assert.deepEqual(playersToSave, []);
    assert.deepEqual(player.status, { _: "inPlay", position: 0 });
  });
});

describe("applySwapWhenInGame", () => {
  it("does nothing when the player is not currently in play", () => {
    let player = makePlayer(1, { status: { _: "onDeck", targetPosition: 0 } });
    let { playersToSave } = applySwapWhenInGame(player, [], POSITIONS, 1, makeGameState());

    assert.deepEqual(playersToSave, []);
  });

  it("moves an in-play player to an empty position, ending and restarting their timer while the clock runs", () => {
    let player = makePlayer(1, {
      status: { _: "inPlay", position: 0 },
      gameTime: [{ start: 500, position: "GK" }],
    });
    let gameState = makeGameState();

    let { playersToSave } = applySwapWhenInGame(player, [], POSITIONS, 2, gameState);

    assert.deepEqual(player.status, { _: "inPlay", position: 2 });
    assert.deepEqual(playersToSave, [player]);
    let times = player.gameTime;
    assert.equal(times[0].end !== undefined, true);
    assert.equal(times.slice(-1)[0].position, "MID");
    assert.equal(typeof times.slice(-1)[0].start, "number");
  });

  it("only updates the recorded position (no end/start) while the game clock is paused", () => {
    let player = makePlayer(1, {
      status: { _: "inPlay", position: 0 },
      gameTime: [{ position: "GK" }],
    });
    let gameState = makeGameState({ gameTime: [] });

    applySwapWhenInGame(player, [], POSITIONS, 2, gameState);

    assert.equal(player.gameTime.length, 1);
    assert.equal(player.gameTime[0].position, "MID");
    assert.equal(player.gameTime[0].start, undefined);
  });

  it("swaps positions with whoever already occupies the target position", () => {
    let player = makePlayer(1, {
      status: { _: "inPlay", position: 0 },
      gameTime: [{ start: 500, position: "GK" }],
    });
    let occupant = makePlayer(2, {
      status: { _: "inPlay", position: 2 },
      gameTime: [{ start: 500, position: "MID" }],
    });
    let gameState = makeGameState();

    let { playersToSave } = applySwapWhenInGame(player, [occupant], POSITIONS, 2, gameState);

    assert.deepEqual(player.status, { _: "inPlay", position: 2 });
    assert.deepEqual(occupant.status, { _: "inPlay", position: 0 });
    assert.deepEqual(playersToSave, [player, occupant]);
    assert.equal(player.gameTime.slice(-1)[0].position, "MID");
    assert.equal(occupant.gameTime.slice(-1)[0].position, "GK");
  });
});
