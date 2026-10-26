import { test, expect } from "./fixtures.js";
import { isRunning, matchSetup, playedMs } from "./match-page.js";

const GOAL = 1;

test.describe("running a match", () => {
  test("puts a lineup on the field and starts the clock", async ({ newCoach }) => {
    let match = await matchSetup(await newCoach("coach"));
    expect(await match.bench()).toEqual(["Ann", "Bo", "Cy", "Dee", "Eve", "Fay"]);

    await match.lineup("Ann", "Bo", "Cy", "Dee");
    expect(await match.field()).toEqual(["Ann", "Bo", "Cy", "Dee"]);
    expect(await match.bench()).toEqual(["Eve", "Fay"]);

    await match.start();
    await expect(match.page.locator("#gameStatus")).toContainText("tap to pause");
    let game = await match.gameState();
    expect(game?.status).toBe("play");
    expect(game?.gameTime).toEqual([{ start: expect.any(Number) }]);
    let ann = await match.playerGame("Ann");
    expect(ann?.status).toEqual({ _: "inPlay", position: 0 });
    expect(ann?.gameTime.at(-1)).toEqual({
      start: expect.any(Number),
      position: expect.any(String),
    });
    expect((await match.playerGame("Eve"))?.gameTime ?? []).toEqual([]);
  });

  test("credits goals to the scorer and keeps both scores", async ({ newCoach }) => {
    let match = await matchSetup(await newCoach("coach"));
    await match.lineup("Ann", "Bo", "Cy", "Dee");
    await match.start();

    await match.goal("Ann");
    await match.goal("Ann");
    await match.goal("Bo");
    await match.opponentGoal();

    expect(await match.score()).toBe("3-1");
    expect(await match.gameState()).toMatchObject({ points: 3, opponentPoints: 1 });
    expect((await match.playerGame("Ann"))?.stats).toEqual([{ statId: GOAL, count: 2 }]);

    let { page } = match.coach;
    await match.coach.goto(`/web/stats?teamId=${match.teamId}`);
    await page.click("#activitiesPerformed");
    let total = (name: string) =>
      page.locator(`#statTables tr:has(th:text-is("${name}")) td`).first();
    await expect(total("Ann")).toHaveText("2");
    await expect(total("Bo")).toHaveText("1");
    await expect(total("Cy")).toHaveText("-");
  });

  test("a substitution stops one player's time and starts the other's", async ({ newCoach }) => {
    let match = await matchSetup(await newCoach("coach"));
    await match.lineup("Ann", "Bo", "Cy", "Dee");
    await match.start();
    await match.page.waitForTimeout(1_200);

    // Eve onto Ann's spot: queued first, then swapped on.
    await match.queue("Eve", 0);
    await expect(match.position(0)).toContainText("Eve next");
    await match.swapAll();

    expect(await match.field()).toEqual(["Eve", "Bo", "Cy", "Dee"]);
    expect(await match.bench()).toContain("Ann");
    let ann = await match.playerGame("Ann");
    expect(ann?.status).toEqual({ _: "out" });
    expect(playedMs(ann?.gameTime)).toBeGreaterThanOrEqual(1_000);
    expect((await match.playerGame("Eve"))?.status).toEqual({ _: "inPlay", position: 0 });

    await match.page.waitForTimeout(500);
    await match.pause();
    await expect(match.page.locator("#gameStatus")).toContainText("tap to start");
    expect((await match.gameState())?.status).toBe("paused");
    let eve = await match.playerGame("Eve");
    expect(isRunning(eve?.gameTime)).toBe(false);
    expect(playedMs(eve?.gameTime)).toBeGreaterThanOrEqual(500);
  });

  test("a player taken off goes to the bench and stops their clock", async ({ newCoach }) => {
    let match = await matchSetup(await newCoach("coach"));
    await match.lineup("Ann", "Bo", "Cy", "Dee");
    await match.start();

    await match.toBench("Bo");

    expect(await match.field()).toEqual(["Ann", "Cy", "Dee"]);
    await expect(match.position(1)).toHaveClass(/is-empty/);
    expect(await match.bench()).toContain("Bo");
    let bo = await match.playerGame("Bo");
    expect(bo?.status).toEqual({ _: "out" });
    expect(isRunning(bo?.gameTime)).toBe(false);
  });

  test("a player marked not playing leaves the bench and can come back", async ({ newCoach }) => {
    let match = await matchSetup(await newCoach("coach"));

    await match.toNotPlaying("Fay");
    expect(await match.notPlaying()).toEqual(["Fay"]);
    expect(await match.bench()).not.toContain("Fay");
    expect((await match.playerGame("Fay"))?.status).toEqual({ _: "notPlaying" });

    await match.backFromNotPlaying("Fay");
    expect(await match.bench()).toContain("Fay");
    expect((await match.playerGame("Fay"))?.status).toEqual({ _: "out" });
  });

  test("ending the game stops every clock and shows the final score", async ({ newCoach }) => {
    let match = await matchSetup(await newCoach("coach"));
    await match.lineup("Ann", "Bo", "Cy", "Dee");
    await match.start();
    await match.goal("Cy");
    await match.page.waitForTimeout(500);

    await match.end();

    await expect(match.page.locator(".match-bar .match-end", { hasText: "Restart" })).toBeVisible();
    await expect(match.page.locator("#gameStatus")).toHaveCount(0);
    let game = await match.gameState();
    expect(game?.status).toBe("ended");
    expect(isRunning(game?.gameTime)).toBe(false);
    for (let name of ["Ann", "Bo", "Cy", "Dee"]) {
      let player = await match.playerGame(name);
      expect(isRunning(player?.gameTime), name).toBe(false);
      expect(playedMs(player?.gameTime), name).toBeGreaterThan(0);
    }

    await match.coach.goto(`/web/games?teamId=${match.teamId}`);
    await expect(match.coach.page.locator("#game-1")).toContainText("1 – 0");
  });

  test("a match runs offline and syncs once back online", async ({ newCoach, device }) => {
    let coach = await newCoach("coach");
    let match = await matchSetup(coach);
    await coach.sync();

    await coach.goOffline();
    await match.lineup("Ann", "Bo", "Cy", "Dee");
    await match.start();
    await match.goal("Dee");
    await match.end();
    expect(await match.score()).toBe("1-0");

    await coach.goOffline(false);
    let result = await coach.sync();
    expect(result.status).toBe(200);
    expect(await coach.idb("updated")).toEqual([]);

    let other = await device(coach.email);
    await other.sync();
    expect(await other.idb(["game-state", match.teamId, 1])).toMatchObject({
      status: "ended",
      points: 1,
    });
    expect(await other.idb(["player-game", match.teamId, match.playerId("Dee"), 1])).toMatchObject({
      stats: [{ statId: GOAL, count: 1 }],
    });
  });
});
