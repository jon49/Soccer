import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isTeamKey, movesIn, pendingAfterMove, planTeamMove } from "./share-logic.js";

const S = "8f3c1d2e-0000-4000-8000-000000000001";

const team = { id: 4, name: "Hawks", year: "2026", active: true, players: [], games: [], _rev: 9 };
const teams = {
  _rev: 3,
  teams: [
    { id: 1, name: "Owls", year: "2025", active: true },
    { id: 4, name: "Hawks", year: "2026", active: true },
  ],
};
const entries: [unknown, any][] = [
  [["team", 4], team],
  [["stats", 4], { stats: [], _rev: 5 }],
  [["player-game", 4, 2, 7], { playerId: 2, gameId: 7, _rev: 6 }],
];

describe("isTeamKey", () => {
  it("matches every per-team key kind for that team only", () => {
    assert.ok(isTeamKey(["team", 4], 4));
    assert.ok(isTeamKey(["game-state", 4, 1], 4));
    assert.ok(isTeamKey(["player-game", 4, 2, 7], 4));
    assert.ok(!isTeamKey(["team", 40], 4));
    assert.ok(!isTeamKey(["team", "4"], 4));
    assert.ok(!isTeamKey(["syncLog", 4], 4));
    assert.ok(!isTeamKey("teams", 4));
  });
});

describe("movesIn", () => {
  it("finds tombstones on personal team keys", () => {
    assert.deepEqual(
      movesIn([
        { key: ["team", 4], data: { movedTo: S, _rev: 1 } },
        { key: ["team", 1], data: team },
        { key: ["stats", 4], data: { movedTo: S } },
        { key: "teams", data: teams },
      ]),
      [{ from: 4, to: S }],
    );
  });
});

describe("planTeamMove when sharing", () => {
  let plan = planTeamMove({ from: 4, to: S, entries, rewrite: () => true, teams });

  it("copies every key to the space id with a fresh revision", () => {
    assert.deepEqual(plan.puts.slice(0, 3), [
      [["team", S], { ...team, id: S, _rev: 0 }],
      [["stats", S], { stats: [], _rev: 0 }],
      [["player-game", S, 2, 7], { playerId: 2, gameId: 7, _rev: 0 }],
    ]);
  });

  it("leaves a tombstone on the old team key and deletes the rest", () => {
    assert.deepEqual(plan.puts[3], [["team", 4], { movedTo: S, _rev: 9 }]);
    assert.deepEqual(plan.deletes, [
      ["stats", 4],
      ["player-game", 4, 2, 7],
    ]);
  });

  it("drops the team from the teams doc and retires its id", () => {
    assert.deepEqual(plan.teams, { _rev: 3, teams: [teams.teams[0]], retiredIds: [4] });
  });

  it("queues the new keys, the tombstone, and the teams doc", () => {
    assert.deepEqual(plan.queue, [
      ["team", S],
      ["stats", S],
      ["player-game", S, 2, 7],
      ["team", 4],
      "teams",
    ]);
    assert.deepEqual(plan.unqueue, [
      ["team", 4],
      ["stats", 4],
      ["player-game", 4, 2, 7],
    ]);
  });
});

describe("planTeamMove on another device", () => {
  it("carries over only unsynced edits", () => {
    let plan = planTeamMove({
      from: 4,
      to: S,
      entries,
      rewrite: (key) => JSON.stringify(key) === JSON.stringify(["stats", 4]),
      teams,
    });
    assert.deepEqual(plan.puts, [
      [["stats", S], { stats: [], _rev: 0 }],
      [["team", 4], { movedTo: S, _rev: 9 }],
    ]);
    // The server already has the tombstone, so it isn't re-sent.
    assert.deepEqual(plan.queue, [["stats", S], "teams"]);
  });

  it("re-sends the tombstone when this device just overwrote it", () => {
    let plan = planTeamMove({ from: 4, to: S, entries, rewrite: () => true, teams });
    assert.ok(plan.queue.some((x) => JSON.stringify(x) === JSON.stringify(["team", 4])));
  });

  it("doesn't touch a teams doc that already retired the id", () => {
    let done = { _rev: 4, teams: [teams.teams[0]], retiredIds: [4] };
    let plan = planTeamMove({ from: 4, to: S, entries: [], rewrite: () => false, teams: done });
    assert.equal(plan.teams, undefined);
    assert.deepEqual(plan.queue, []);
    assert.deepEqual(plan.puts, [[["team", 4], { movedTo: S, _rev: 0 }]]);
  });

  it("keeps an existing tombstone instead of copying it", () => {
    let plan = planTeamMove({
      from: 4,
      to: S,
      entries: [[["team", 4], { movedTo: S, _rev: 12 }]],
      rewrite: () => true,
      teams: undefined,
    });
    assert.deepEqual(plan.puts, [[["team", 4], { movedTo: S, _rev: 12 }]]);
    assert.deepEqual(plan.queue, []);
  });
});

describe("pendingAfterMove", () => {
  it("swaps the old keys for the new ones in the pending set", () => {
    let updated = new Set<unknown>([JSON.stringify(["stats", 4]), JSON.stringify(["team", 1])]);
    let result = pendingAfterMove(updated, {
      unqueue: [["stats", 4]],
      queue: [["stats", S], "teams"],
    });
    assert.deepEqual(
      Array.from(result).sort(),
      [JSON.stringify(["stats", S]), JSON.stringify(["team", 1]), "teams"].sort(),
    );
  });
});
