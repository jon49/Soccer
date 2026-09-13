import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pendingAfterSync } from "./sync-logic.js";

describe("pendingAfterSync", () => {
  it("returns undefined unchanged when there is nothing pending", () => {
    assert.equal(pendingAfterSync(undefined, [{ key: "a" }]), undefined);
  });

  it("drops keys the server confirmed as saved", () => {
    let updated = new Set(["a", "b"]);
    let result = pendingAfterSync(updated, [{ key: "a" }, { key: "b" }]);
    assert.deepEqual(Array.from(result ?? []), []);
  });

  it("keeps keys the server did not confirm (rejected, conflicted, or omitted)", () => {
    // Regression: a game-ending sync where the server rejects the game-state
    // and player-game records (e.g. a stale revision) must not be forgotten
    // just because *some other* key in the same batch was saved.
    let updated = new Set(["game-state", "player-game-1", "unrelated-saved-key"]);
    let result = pendingAfterSync(updated, [{ key: "unrelated-saved-key" }]);
    assert.deepEqual(Array.from(result ?? []).sort(), ["game-state", "player-game-1"]);
  });

  it("leaves everything queued when nothing was saved", () => {
    let updated = new Set(["x", "y"]);
    let result = pendingAfterSync(updated, []);
    assert.deepEqual(Array.from(result ?? []).sort(), ["x", "y"]);
  });
});
