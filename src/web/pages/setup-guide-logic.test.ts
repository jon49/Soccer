import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nextSetupStep, setupSteps, type SetupProgress } from "./setup-guide-logic.js";

function progress(o: Partial<SetupProgress> = {}): SetupProgress {
  return { teamId: 7, players: 0, positions: 0, games: 0, started: false, ...o };
}

describe("setupSteps", () => {
  it("starts with the team made and players next", () => {
    let steps = setupSteps(progress());
    assert.deepEqual(
      steps.map((x) => [x.id, x.done]),
      [
        ["team", true],
        ["players", false],
        ["formation", false],
        ["game", false],
        ["play", false],
      ],
    );
    assert.equal(nextSetupStep(steps)?.id, "players");
    assert.equal(nextSetupStep(steps)?.url, "/web/players?teamId=7");
  });

  it("moves on as players, a formation and a game are added", () => {
    assert.equal(nextSetupStep(setupSteps(progress({ players: 3 })))?.id, "formation");
    assert.equal(nextSetupStep(setupSteps(progress({ players: 3, positions: 4 })))?.id, "game");
    let play = nextSetupStep(
      setupSteps(progress({ players: 3, positions: 4, games: 1, gameId: 2 })),
    );
    assert.equal(play?.id, "play");
    assert.equal(play?.url, "/web/match?teamId=7&gameId=2");
  });

  it("points the match step at the games list until there's a game", () => {
    let play = setupSteps(progress()).find((x) => x.id === "play");
    assert.equal(play?.url, "/web/games?teamId=7");
  });

  it("keeps an earlier step open even when a later one is done", () => {
    // A shared team can arrive with games but no formation yet.
    assert.equal(nextSetupStep(setupSteps(progress({ players: 2, games: 1 })))?.id, "formation");
  });

  it("is done once a game has been started", () => {
    let steps = setupSteps(
      progress({ players: 3, positions: 4, games: 1, gameId: 1, started: true }),
    );
    assert.equal(nextSetupStep(steps), undefined);
  });
});
