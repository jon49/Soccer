import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { TeamPlayer } from "./db.js";
import { playersInOrder, playersShown } from "./utils.js";

function player(id: number, name: string, active: boolean, sub?: boolean): TeamPlayer {
  return { id, name, active, ...(sub ? { sub } : {}) };
}

describe("playersInOrder", () => {
  it("lists active players, then subs, then inactive, each by name", () => {
    let players = [
      player(1, "Zed", false),
      player(2, "Bea", true, true),
      player(3, "Cal", true),
      player(4, "Amy", false),
      player(5, "Abe", true, true),
      player(6, "Ann", true),
    ];
    assert.deepEqual(
      playersInOrder(players).map((x) => x.name),
      ["Ann", "Cal", "Abe", "Bea", "Amy", "Zed"],
    );
  });

  it("leaves the team's own list as it was", () => {
    let players = [player(1, "Bo", true), player(2, "Al", true)];
    playersInOrder(players);
    assert.deepEqual(
      players.map((x) => x.name),
      ["Bo", "Al"],
    );
  });
});

describe("playersShown", () => {
  let players = [
    player(1, "Zed", false),
    player(2, "Bea", true, true),
    player(3, "Cal", true),
    player(4, "Amy", false),
    player(5, "Ann", true),
  ];
  let names = (show: Parameters<typeof playersShown>[1]) =>
    playersShown(players, show).map((x) => x.name);

  it("lists only active players, by name, unless asked for more", () => {
    assert.deepEqual(names({}), ["Ann", "Cal"]);
  });

  it("adds subs, inactive players, or both, after the active ones", () => {
    assert.deepEqual(names({ subs: true }), ["Ann", "Cal", "Bea"]);
    assert.deepEqual(names({ inactive: true }), ["Ann", "Cal", "Amy", "Zed"]);
    assert.deepEqual(names({ subs: true, inactive: true }), ["Ann", "Cal", "Bea", "Amy", "Zed"]);
  });
});
