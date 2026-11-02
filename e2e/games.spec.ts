import { test, expect } from "./fixtures.js";

test.describe("the games list", () => {
  test("editing a game saves it and moves it into date order", async ({ newCoach }) => {
    let coach = await newCoach("coach");
    let teamId = await coach.createTeam("Hawks", "2026");
    // Far-off dates: the list puts games more than a day past at the bottom,
    // so dates near today would change the order as time passes.
    await coach.addGame(teamId, "Owls", "2099-11-01T10:00");
    await coach.addGame(teamId, "Bears", "2099-11-08T09:30");

    let { page } = coach;
    let opponents = page.locator("#games .game-opponent");
    await expect(opponents).toHaveText(["vs Owls", "vs Bears"]);

    let bears = page.locator("#games > li", { hasText: "Bears" });
    await bears.locator("summary").click();
    await bears.locator("input[name=date]").fill("2099-10-31T08:00");
    await bears.locator("input[name=opponent]").fill("Grizzlies");
    await coach.tap("edit", () => bears.locator("form button").click());

    await expect(opponents).toHaveText(["vs Grizzlies", "vs Owls"]);
    let games = (await coach.idb<{ games: { opponent: string; date: string }[] }>([
      "team",
      teamId,
    ]))!.games;
    expect(games.find((x) => x.opponent === "Grizzlies")?.date).toBe("2099-10-31");
  });
});
