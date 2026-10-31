import { test, expect, sql, hex } from "./fixtures.js";

const userId = (email: string) => sql(`SELECT hex(id) FROM _user WHERE email = '${email}'`);
const count = (query: string) => +sql(`SELECT COUNT(*) FROM ${query}`);

test.describe("deleting your account", () => {
  test("removes the account and its data, on the server and on this device", async ({
    newCoach,
  }) => {
    let a = await newCoach("a");
    let teamId = await a.createTeam("Hawks", "2026");
    await a.addPlayer(teamId, "Ann");
    await a.sync();
    let id = userId(a.email);
    expect(count(`user_data WHERE hex(user) = '${id}'`)).toBeGreaterThan(0);

    expect(await a.deleteAccount()).toEqual(["Your account and its data were deleted."]);

    expect(count(`_user WHERE hex(id) = '${id}'`)).toBe(0);
    expect(count(`user_data WHERE hex(user) = '${id}'`)).toBe(0);
    await expect(a.page.locator("#auth-link")).toHaveText("Login");
    await expect(a.page.locator("#account")).toBeEmpty();
    expect(await a.idb("auth_token")).toBeFalsy();
    expect(await a.idb("refresh_token")).toBeFalsy();
    expect(await a.idb(["team", teamId])).toBeUndefined();
    expect(await a.teamNames()).toEqual([]);

    // The account is gone, so its password no longer logs in.
    await a.page.goto("/login/");
    await a.fillLogin();
    await expect(a.page.locator("main .message")).toBeVisible();
    expect(a.page.url()).toContain("/login");
  });

  test("keeps the theme this device was set to", async ({ newCoach }) => {
    let a = await newCoach("a");
    await a.goto("/web/settings");
    await a.page.evaluate(() =>
      fetch("/web/settings?handler=theme", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "theme=dark",
      }),
    );
    await a.deleteAccount();
    expect(await a.idb("settings")).toMatchObject({ theme: "dark" });
  });

  test("logs the coach's other devices out on their next sync", async ({ newCoach, device }) => {
    let a = await newCoach("a");
    await a.createTeam("Hawks", "2026");
    await a.sync();
    let a2 = await device(a.email);
    await a2.sync();
    expect(await a2.teamNames()).toEqual(["Hawks - 2026"]);

    await a.deleteAccount();

    await a2.sync();
    expect(await a2.idb("auth_token")).toBeFalsy();
    await a2.goto("/web/teams");
    await expect(a2.page.locator("#auth-link")).toHaveText("Login");
  });

  test("leaves a shared team with the other coaches", async ({ newCoach }) => {
    let a = await newCoach("a");
    let teamId = await a.createTeam("Hawks", "2026");
    await a.addPlayer(teamId, "Ann");
    let { space, invite } = await a.shareTeam(teamId);
    let b = await newCoach("b");
    await b.join(invite);
    await b.addPlayer(space, "Bo");
    await b.sync();
    let rows = count(`user_data WHERE hex(space) = '${hex(space)}'`);

    await a.deleteAccount();

    // A's rows in the team stay, no longer tied to A.
    expect(count(`user_data WHERE hex(space) = '${hex(space)}'`)).toBe(rows);
    expect(count(`spaces WHERE hex(id) = '${hex(space)}'`)).toBe(1);
    await b.sync();
    expect(await b.teamNames()).toEqual(["Hawks - 2026 Shared"]);
    expect(await b.playerNames(space)).toEqual(["Ann", "Bo"]);
    expect(await b.members(space)).toEqual([`${b.email} (you)`]);
  });

  test("deletes a shared team nobody else is in", async ({ newCoach }) => {
    let a = await newCoach("a");
    let { space } = await a.shareTeam(await a.createTeam("Hawks", "2026"));
    expect(count(`user_data WHERE hex(space) = '${hex(space)}'`)).toBeGreaterThan(0);

    await a.deleteAccount();

    expect(count(`spaces WHERE hex(id) = '${hex(space)}'`)).toBe(0);
    expect(count(`user_data WHERE hex(space) = '${hex(space)}'`)).toBe(0);
  });

  test("when the server can't be reached, keeps the account and this device's data", async ({
    newCoach,
  }) => {
    let a = await newCoach("a");
    let teamId = await a.createTeam("Hawks", "2026");
    // setOffline() doesn't reach the service worker's requests; routing does.
    await a.context.route("**/api/auth/v1/delete", (x) => x.abort("internetdisconnected"));

    expect(await a.deleteAccount()).toEqual([
      "You appear to be offline. Connect to the internet and try again.",
    ]);

    expect(count(`_user WHERE email = '${a.email}'`)).toBe(1);
    expect(await a.idb("auth_token")).toBeTruthy();
    expect(await a.idb(["team", teamId])).toBeTruthy();
    await expect(a.page.locator("#account button")).toHaveText("Delete account");
  });

  test("is offered only while logged in", async ({ newCoach }) => {
    let a = await newCoach("a");
    await a.goto("/web/settings");
    await expect(a.page.locator("#account button")).toHaveText("Delete account");
    await a.logout();
    await a.goto("/web/settings");
    await expect(a.page.locator("#account button")).toHaveCount(0);
  });
});
