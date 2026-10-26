import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTeamId } from "./validators.js";
import { getNewTeamId } from "./utils.js";

const S = "8F3C1D2E-0000-4000-8000-000000000001";

describe("createTeamId", () => {
  let teamId = createTeamId("Team ID");

  it("accepts a positive whole number, from a number or a query string", async () => {
    assert.equal(await teamId(3), 3);
    assert.equal(await teamId("3"), 3);
  });

  it("accepts a space uuid and lower-cases it", async () => {
    assert.equal(await teamId(S), S.toLowerCase());
  });

  it("rejects zero, fractions, and strings that aren't uuids", async () => {
    await assert.rejects(teamId(0));
    await assert.rejects(teamId("1.5"));
    await assert.rejects(teamId("abc"));
    await assert.rejects(teamId(S.slice(1)));
  });
});

describe("getNewTeamId", () => {
  it("starts at 1", () => {
    assert.equal(getNewTeamId(undefined), 1);
  });

  it("ignores shared team ids", () => {
    let teams = { _rev: 0, teams: [{ id: 2, name: "a", year: "1", active: true }] };
    assert.equal(getNewTeamId(teams), 3);
  });

  it("never reuses the id of a team that was moved into a shared team", () => {
    let teams = {
      _rev: 0,
      teams: [{ id: 1, name: "a", year: "1", active: true }],
      retiredIds: [4],
    };
    assert.equal(getNewTeamId(teams), 5);
  });
});
