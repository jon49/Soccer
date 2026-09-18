import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pendingAfterSync } from "./sync-logic.js";

describe("pendingAfterSync", () => {
  it("returns undefined unchanged when there is nothing pending", () => {
    assert.equal(pendingAfterSync(undefined, [{ key: '"a"' }]), undefined);
  });

  it("drops array keys the server confirmed as saved", () => {
    // Array keys are already stored locally as their own JSON.stringify
    // form, and the server echoes that same string back unchanged.
    let updated = new Set(['["a",1]', '["b",2]']);
    let result = pendingAfterSync(updated, [{ key: '["a",1]' }, { key: '["b",2]' }]);
    assert.deepEqual(Array.from(result ?? []), []);
  });

  it("drops a bare string key the server confirmed as saved", () => {
    // Regression: "teams" is the app's one plain-string synced key. It's
    // stored locally as the bare string "teams", but the server echoes the
    // canonical JSON encoding `"teams"` (quote characters included). This
    // used to never match, so "teams" stayed queued and re-sent forever.
    let updated = new Set(["teams"]);
    let result = pendingAfterSync(updated, [{ key: '"teams"' }]);
    assert.deepEqual(Array.from(result ?? []), []);
  });

  it("keeps keys the server did not confirm (rejected, conflicted, or omitted)", () => {
    // Regression: a game-ending sync where the server rejects the game-state
    // and player-game records (e.g. a stale revision) must not be forgotten
    // just because *some other* key in the same batch was saved.
    let updated = new Set(['["game-state"]', '["player-game-1"]', "unrelated-saved-key"]);
    let result = pendingAfterSync(updated, [{ key: '"unrelated-saved-key"' }]);
    assert.deepEqual(
      Array.from(result ?? []).sort(),
      ['["game-state"]', '["player-game-1"]'].sort(),
    );
  });

  it("leaves everything queued when nothing was saved", () => {
    let updated = new Set(["x", "y"]);
    let result = pendingAfterSync(updated, []);
    assert.deepEqual(Array.from(result ?? []).sort(), ["x", "y"]);
  });
});
