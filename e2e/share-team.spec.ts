import { test, expect, sql, hex, makeAppOwner } from "./fixtures.js";

test.describe("sharing a team", () => {
  test("moves the team to its shared id and offers an invite link", async ({ newCoach }) => {
    let a = await newCoach("a");
    let teamId = await a.createTeam("Hawks", "2026");
    await a.addPlayer(teamId, "Ann");
    await a.addPlayer(teamId, "Bo");

    let { space, invite } = await a.shareTeam(teamId);

    expect(space).toMatch(/^[0-9a-f-]{36}$/);
    expect(invite).toContain(`/web/join/?code=`);
    await expect(a.page.locator("#members")).toContainText(`${a.email} (you)`);

    expect(await a.idb(["team", teamId])).toMatchObject({ movedTo: space });
    expect(await a.idb("teams")).toMatchObject({ teams: [], retiredIds: [teamId] });
    let leftovers = (await a.idbKeys()).filter(
      (x) => Array.isArray(x) && x[1] === teamId && x[0] !== "team",
    );
    expect(leftovers).toEqual([]);
    expect(await a.idb("updated")).toEqual([]);

    expect(await a.teamNames()).toEqual(["Hawks - 2026 Shared"]);
    expect(await a.playerNames(space)).toEqual(["Ann", "Bo"]);
  });

  test("never reuses a shared team's old id for a new team", async ({ newCoach }) => {
    let a = await newCoach("a");
    let first = await a.createTeam("Hawks", "2026");
    await a.shareTeam(first);
    expect(await a.createTeam("Owls", "2026")).toBe(first + 1);
  });

  test("carries a second device's offline edits into the shared team", async ({
    newCoach,
    device,
  }) => {
    let a = await newCoach("a");
    let teamId = await a.createTeam("Hawks", "2026");
    await a.addPlayer(teamId, "Ann");
    await a.sync();

    let a2 = await device(a.email);
    await a2.sync();
    expect(await a2.playerNames(teamId)).toEqual(["Ann"]);
    await a2.goOffline();
    await a2.addPlayer(teamId, "Cy");

    let { space } = await a.shareTeam(teamId);

    await a2.goOffline(false);
    await a2.sync();
    await a2.sync();
    expect(await a2.teamNames()).toEqual(["Hawks - 2026 Shared"]);
    expect(await a2.playerNames(space)).toEqual(["Ann", "Cy"]);
    expect(await a2.idb(["team", teamId])).toMatchObject({ movedTo: space });

    await a.sync();
    expect(await a.playerNames(space)).toEqual(["Ann", "Cy"]);
    // A2 uploaded its stale team record as it synced; it must re-send the
    // tombstone so A's devices keep ignoring the old team.
    expect(await a.idb(["team", teamId])).toMatchObject({ movedTo: space });
  });

  test("an invited coach joins after logging in, and both can edit", async ({ newCoach }) => {
    let a = await newCoach("a");
    let teamId = await a.createTeam("Hawks", "2026");
    await a.addPlayer(teamId, "Ann");
    let { space, invite } = await a.shareTeam(teamId);

    // B already has a personal team with the same name (and the same id).
    let b = await newCoach("b");
    expect(await b.createTeam("Hawks", "2026")).toBe(teamId);
    await b.addPlayer(teamId, "Zed");

    await b.logout();
    await b.goto(invite);
    await expect(b.page.locator("#join")).toContainText("Log in to join this team.");
    await b.page.click("#join a:has-text('Log in')");
    await b.fillLogin();
    await b.page.waitForURL(/\/web\/join\//);
    await expect(b.page.locator("#join")).toContainText(`Join the team shared by ${a.email}?`);
    await b.page.click("button:has-text('Join')");
    await expect(b.page.locator("#join")).toContainText("You joined Hawks (2026).");

    expect((await b.teamNames()).sort()).toEqual(["Hawks - 2026", "Hawks - 2026 Shared"]);
    expect(await b.playerNames(teamId)).toEqual(["Zed"]);
    expect(await b.playerNames(space)).toEqual(["Ann"]);

    await b.addPlayer(space, "Dee");
    await b.sync();
    await a.sync();
    expect(await a.playerNames(space)).toEqual(["Ann", "Dee"]);
    await expect.poll(() => a.members(space)).toContain(b.email);
  });

  test("moves a published schedule with the team so the other coach can republish it", async ({
    newCoach,
  }) => {
    let a = await newCoach("a");
    makeAppOwner(a.email);
    let teamId = await a.createTeam("Hawks", "2026");
    await a.addGame(teamId, "Owls");
    let scheduleId = await a.publishSchedule(teamId);
    let { space, invite } = await a.shareTeam(teamId);

    let pageRow = () =>
      sql(`SELECT hex(space) || ' ' || updated FROM pages WHERE hex(id) = '${hex(scheduleId)}'`);
    expect(pageRow()).toMatch(new RegExp(`^${hex(space)} `));

    let b = await newCoach("b");
    await b.join(invite);
    let before = pageRow();
    // Page timestamps have one-second resolution.
    await b.page.waitForTimeout(1100);
    expect(await b.publishSchedule(space)).toBe(scheduleId);
    expect(pageRow()).not.toBe(before);
  });

  test("refuses used and unknown invite codes", async ({ newCoach }) => {
    let a = await newCoach("a");
    let { invite } = await a.shareTeam(await a.createTeam("Hawks", "2026"));
    let b = await newCoach("b");
    await b.join(invite);

    await b.goto(invite);
    await expect(b.page.locator("#join")).toContainText("expired or was already used");
    await b.goto("/web/join/?code=00000000-0000-4000-8000-000000000000");
    await expect(b.page.locator("#join")).toContainText("expired or was already used");
  });

  test("removing a coach takes the team off their device", async ({ newCoach }) => {
    let a = await newCoach("a");
    let { space, invite } = await a.shareTeam(await a.createTeam("Hawks", "2026"));
    let b = await newCoach("b");
    await b.join(invite);

    await a.goto(`/web/share?teamId=${space}`);
    await a.page.click(`#members li:has-text('${b.email}') button:has-text('Remove')`);
    await expect(a.page.locator("#members")).not.toContainText(b.email);

    let result = await b.sync();
    expect(result.messages.join(" ")).toContain('You no longer have access to "Hawks".');
    expect(await b.teamNames()).toEqual([]);
    expect((await b.idbKeys()).filter((x) => Array.isArray(x) && x[1] === space)).toEqual([]);
    expect(Object.keys((await b.idb("settings"))?.spaces ?? {})).toEqual([]);
  });

  test("a coach can leave, and the last one out deletes the team", async ({ newCoach, device }) => {
    let a = await newCoach("a");
    let { space, invite } = await a.shareTeam(await a.createTeam("Hawks", "2026"));
    let a2 = await device(a.email);
    await a2.sync();
    let b = await newCoach("b");
    await b.join(invite);

    await b.goto(`/web/share?teamId=${space}`);
    let leave = b.page.locator("button:has-text('Leave team')");
    await expect(leave).not.toHaveAttribute("data-confirm", /deletes the team/);
    await leave.click();
    await b.page.waitForURL(/\/web\/teams/);
    expect(await b.teamNames()).toEqual([]);
    expect(await a.members(space)).toEqual([`${a.email} (you)`]);

    await a.goto(`/web/share?teamId=${space}`);
    leave = a.page.locator("button:has-text('Leave team')");
    await expect(leave).toHaveAttribute("data-confirm", /deletes the team and all its games/);
    await leave.click();
    await a.page.waitForURL(/\/web\/teams/);
    expect(await a.teamNames()).toEqual([]);
    expect(sql(`SELECT COUNT(*) FROM spaces WHERE hex(id) = '${hex(space)}'`)).toBe("0");

    await a2.sync();
    expect(await a2.teamNames()).toEqual([]);
  });
});
