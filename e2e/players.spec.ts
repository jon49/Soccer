import { test, expect } from "./fixtures.js";

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

  await a.page
    .locator(".player-row", { has: a.page.locator("input[value=Ann]") })
    .locator(".toggle")
    .click();
  await expect(heading).toHaveText("Players (1)");

  await a.page.reload();
  await expect(heading).toHaveText("Players (1)");
});
