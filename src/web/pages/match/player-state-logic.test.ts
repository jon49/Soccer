import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isRosterFull, staleAfterMs } from "./player-state-logic.js";

describe("staleAfterMs", () => {
  it("converts minutes to milliseconds", () => {
    assert.equal(staleAfterMs(5, 8), 5 * 60 * 1000);
  });

  it("falls back to the default when unset", () => {
    assert.equal(staleAfterMs(undefined, 8), 8 * 60 * 1000);
  });

  it("returns null when explicitly set to 0 (highlight disabled)", () => {
    assert.equal(staleAfterMs(0, 8), null);
  });
});

describe("isRosterFull", () => {
  it("is false when there are open positions", () => {
    assert.equal(isRosterFull(5, 1, 7), false);
  });

  it("is true once in-play plus on-deck players fill every position", () => {
    assert.equal(isRosterFull(5, 2, 7), true);
  });

  it("is true when there are more players slotted than positions", () => {
    assert.equal(isRosterFull(6, 2, 7), true);
  });
});
