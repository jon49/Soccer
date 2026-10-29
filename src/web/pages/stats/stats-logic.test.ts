import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Game, GameState, GameStatus } from "../../server/db.js";
import { playedInOrder } from "./stats-logic.js";

function row(id: number, date: string, status?: GameStatus, time?: string) {
  let game: Game = { id, date, time, home: true, opponent: `Team ${id}` };
  let state: GameState = {
    _rev: 0,
    gameId: id,
    status,
    points: 0,
    opponentPoints: 0,
    gameTime: [],
  };
  return { game, state };
}

describe("playedInOrder", () => {
  it("keeps only games that have been started", () => {
    let rows = [row(1, "2026-11-01", "ended"), row(2, "2026-11-08"), row(3, "2026-11-15", "play")];
    assert.deepEqual(
      playedInOrder(rows).map((x) => x.game.id),
      [1, 3],
    );
  });

  it("orders by date, then time, not by when the game was added", () => {
    let rows = [
      row(1, "2026-11-08", "ended"),
      row(2, "2026-10-20", "ended", "13:00"),
      row(3, "2026-10-20", "paused", "09:00"),
    ];
    assert.deepEqual(
      playedInOrder(rows).map((x) => x.game.id),
      [3, 2, 1],
    );
  });
});
