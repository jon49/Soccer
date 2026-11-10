import { test, expect } from "./fixtures.js";
import { matchSetup } from "./match-page.js";

test("the Players heading counts active players as they are added and toggled", async ({
  newCoach,
}) => {
  let a = await newCoach("a");
  let teamId = await a.createTeam("Hawks", "2026");
  let heading = a.page.locator("h3#players");

  await a.goto(`/web/players?teamId=${teamId}`);
  await expect(heading).toHaveText("Players (0)");

  await a.addPlayer(teamId, "Ann");
  await a.page.fill("#newPlayer", "Bo");
  await a.page.press("#newPlayer", "Enter");
  await expect(heading).toHaveText("Players (2)");

  let ann = a.page.locator(".player-row", { has: a.page.locator("input[value=Ann]") });
  let status = ann.locator(".status-toggle label:visible");
  await expect(status).toHaveText("Active");

  // Active, then Inactive, then Sub, then back to Active. Subs aren't counted.
  let tap = () => a.tap("editPlayer", () => status.click());
  await tap();
  await expect(status).toHaveText("Inactive");
  await expect(heading).toHaveText("Players (1)");

  await tap();
  await expect(status).toHaveText("Sub");
  await expect(heading).toHaveText("Players (1)");

  await a.page.reload();
  await expect(status).toHaveText("Sub");
  await expect(heading).toHaveText("Players (1)");
  expect((await a.idb(["team", teamId]))?.players[0]).toMatchObject({ active: true, sub: true });

  await tap();
  await expect(status).toHaveText("Active");
  await expect(heading).toHaveText("Players (2)");
  expect((await a.idb(["team", teamId]))?.players[0]).not.toHaveProperty("sub");
});

test("a sub plays in a match and is marked as one", async ({ newCoach }) => {
  let coach = await newCoach("coach");
  let match = await matchSetup(coach);
  await coach.goto(`/web/players?teamId=${match.teamId}`);
  let fay = coach.page.locator(".player-row", { has: coach.page.locator("input[value=Fay]") });
  let status = fay.locator(".status-toggle label:visible");
  let tap = () => coach.tap("editPlayer", () => status.click());
  await tap();
  await tap();
  await expect(status).toHaveText("Sub");

  await match.open();
  await expect(match.player("Fay").locator(".sub-mark")).toBeVisible();
  await expect(match.player("Eve").locator(".sub-mark")).toHaveCount(0);

  await match.lineup("Fay", "Bo", "Cy", "Dee");
  expect(await match.field()).toContain("Fay SUB");
});
