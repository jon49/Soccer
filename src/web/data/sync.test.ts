import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalKey,
  confirmSaved,
  keysInSpaces,
  pendingAfterSync,
  pendingWithoutSpaces,
  spaceOf,
  spacesDiff,
  syncRequest,
} from "./sync-logic.js";

const S = "8f3c1d2e-0000-4000-8000-000000000001";
const T = "8f3c1d2e-0000-4000-8000-000000000002";

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

describe("confirmSaved", () => {
  let key = ["player-game", 1, 2, 3];
  let sentA = { status: { _: "inPlay", position: 0 }, _rev: 4 };
  let sent = new Map([[canonicalKey(key), sentA]]);

  it("confirms a record that is still what was sent and stamps its revision", () => {
    let result = confirmSaved([{ key, id: 812 }], sent, [{ ...sentA }]);
    assert.deepEqual(result.confirmed, [{ key: canonicalKey(key) }]);
    assert.deepEqual(result.records, [[key, { ...sentA, _rev: 812 }]]);
    assert.deepEqual(result.missing, []);
  });

  it("keeps a record edited while the request was in flight queued, with the new revision", () => {
    // Regression: the coach benches a player while a sync is out. The newer
    // edit used to take the server's revision and leave the queue, so it
    // never reached the server.
    let edited = { status: { _: "out" }, _rev: 4 };
    let result = confirmSaved([{ key, id: 812 }], sent, [edited]);
    assert.deepEqual(result.confirmed, []);
    assert.deepEqual(result.records, [[key, { ...edited, _rev: 812 }]]);
  });

  it("ignores only the revision when comparing", () => {
    let result = confirmSaved([{ key, id: 812 }], sent, [{ ...sentA, _rev: 900 }]);
    assert.deepEqual(result.confirmed, [{ key: canonicalKey(key) }]);
  });

  it("does not confirm a key that was not sent", () => {
    let result = confirmSaved([{ key: "teams", id: 5 }], sent, [{ teams: [], _rev: 1 }]);
    assert.deepEqual(result.confirmed, []);
    assert.deepEqual(result.records, [["teams", { teams: [], _rev: 5 }]]);
  });

  it("reports records that no longer exist locally", () => {
    let result = confirmSaved([{ key, id: 812 }], sent, [undefined]);
    assert.deepEqual(result.missing, [key]);
    assert.deepEqual(result.records, []);
  });

  it("matches the bare teams key against the server's quoted form", () => {
    let teams = { teams: [], _rev: 1 };
    let result = confirmSaved(
      [{ key: "teams", id: 2 }],
      new Map([[canonicalKey("teams"), teams]]),
      [{ ...teams }],
    );
    assert.deepEqual(result.confirmed, [{ key: '"teams"' }]);
  });
});

describe("pendingAfterSync with space keys", () => {
  it("drops confirmed space keys and keeps the rest", () => {
    let updated = new Set([JSON.stringify(["team", S]), JSON.stringify(["team", 1])]);
    let result = pendingAfterSync(updated, [{ key: JSON.stringify(["team", S]) }]);
    assert.deepEqual(Array.from(result ?? []), [JSON.stringify(["team", 1])]);
  });
});

describe("spaceOf", () => {
  let spaces = { [S]: 3 };

  it("returns the space for a key whose team id is a space we're in", () => {
    assert.equal(spaceOf(["team", S], spaces), S);
    assert.equal(spaceOf(["player-game", S, 2, 5], spaces), S);
  });

  it("treats numeric team ids and the bare teams key as personal", () => {
    assert.equal(spaceOf(["team", 1], spaces), undefined);
    assert.equal(spaceOf("teams", spaces), undefined);
    assert.equal(spaceOf("settings", spaces), undefined);
  });

  it("treats a string id we're not a member of as personal", () => {
    assert.equal(spaceOf(["team", T], spaces), undefined);
  });

  it("ignores object prototype names", () => {
    assert.equal(spaceOf(["team", "toString"], {}), undefined);
  });
});

describe("syncRequest", () => {
  it("sends cursors and tags only space items with their space", () => {
    let spaces = { [S]: 7 };
    let body = syncRequest(12, spaces, [
      { key: ["team", S], data: { name: "A", _rev: 4 } },
      { key: "teams", data: { teams: [], _rev: 2 } },
      { key: ["stats", 1], data: { stats: [] } },
    ]);
    assert.equal(body.lastSyncedId, 12);
    assert.deepEqual(body.spaces, spaces);
    assert.deepEqual(body.data, [
      { key: ["team", S], data: { name: "A", _rev: 4 }, id: 4, space: S },
      { key: "teams", data: { teams: [], _rev: 2 }, id: 2 },
      { key: ["stats", 1], data: { stats: [] }, id: 0 },
    ]);
  });

  it("sends an empty spaces object when we're in none", () => {
    assert.deepEqual(syncRequest(0, {}, []), { lastSyncedId: 0, spaces: {}, data: [] });
  });
});

describe("spacesDiff", () => {
  it("finds spaces that were added", () => {
    assert.deepEqual(spacesDiff({}, { [S]: 9 }), { added: [S], removed: [] });
  });

  it("finds spaces that were removed", () => {
    assert.deepEqual(spacesDiff({ [S]: 9, [T]: 1 }, { [T]: 4 }), { added: [], removed: [S] });
  });

  it("reports nothing when only cursors moved", () => {
    assert.deepEqual(spacesDiff({ [S]: 1 }, { [S]: 20 }), { added: [], removed: [] });
  });
});

describe("keysInSpaces", () => {
  it("picks every key whose team id is one of the spaces", () => {
    let keys = [["team", S], ["game-state", S, 3], ["team", T], ["team", 1], "teams", "settings"];
    assert.deepEqual(keysInSpaces(keys, [S]), [
      ["team", S],
      ["game-state", S, 3],
    ]);
  });
});

describe("pendingWithoutSpaces", () => {
  it("drops pending keys for spaces we lost and keeps everything else", () => {
    let updated = new Set([
      JSON.stringify(["team", S]),
      JSON.stringify(["player-game", S, 1, 2]),
      JSON.stringify(["team", T]),
      JSON.stringify(["team", 1]),
      "teams",
    ]);
    let result = pendingWithoutSpaces(updated, [S]);
    assert.deepEqual(
      Array.from(result ?? []).sort(),
      [JSON.stringify(["team", 1]), JSON.stringify(["team", T]), "teams"].sort(),
    );
  });

  it("is a no-op when no spaces were lost", () => {
    let updated = new Set([JSON.stringify(["team", S])]);
    assert.deepEqual(Array.from(pendingWithoutSpaces(updated, []) ?? []), [
      JSON.stringify(["team", S]),
    ]);
  });
});
