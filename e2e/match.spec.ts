import { test, expect } from "./fixtures.js";
import { MatchPage, isRunning, matchSetup, playedMs, setTeamStat } from "./match-page.js";

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

  test("auto-sync merges new data into the match without a reload", async ({
    newCoach,
    device,
  }) => {
    let coach = await newCoach("coach");
    let match = await matchSetup(coach);
    await match.lineup("Ann", "Bo", "Cy", "Dee");
    await coach.sync();

    let other = await device(coach.email);
    await other.sync();
    let otherMatch = new MatchPage(other, match.teamId, match.gameId, match.players);
    await otherMatch.open();
    await other.autoSync();
    await other.page.evaluate(() => ((window as any).notReloaded = true));

    await match.goal("Ann");
    await coach.sync();

    // A change on the other device sets off its auto-sync. (Not to the score:
    // both devices changing it would be a conflict, which the last upload
    // wins.) A bench player selected before the new data arrives stays
    // selected.
    await otherMatch.toBench("Dee");
    await otherMatch.player("Eve").click();

    await expect.poll(() => otherMatch.score(), { timeout: 10_000 }).toBe("1-0");
    expect(await other.page.evaluate(() => (window as any).notReloaded)).toBe(true);
    await expect(otherMatch.player("Eve")).toHaveClass(/is-selected/);
    await expect(other.page.locator("body[data-selecting=out]")).toHaveCount(1);
  });

  test("a goal with no scorer counts for the team only", async ({ newCoach }) => {
    let match = await matchSetup(await newCoach("coach"));
    await match.lineup("Ann", "Bo", "Cy", "Dee");
    await match.start();

    await match.goalNoScorer();

    expect(await match.score()).toBe("1-0");
    for (let name of ["Ann", "Bo", "Cy", "Dee"]) {
      expect((await match.playerGame(name))?.stats ?? [], name).toEqual([]);
    }
  });

  test("with the Goal stat off, tapping the score just adds a point", async ({ newCoach }) => {
    let coach = await newCoach("coach");
    let match = await matchSetup(coach);
    await setTeamStat(coach, match.teamId, "goal", false);
    await match.open();
    await match.lineup("Ann", "Bo", "Cy", "Dee");

    await match.act("scorePoint", () => match.page.click(".match-bar .score"));

    expect(await match.score()).toBe("1-0");
    expect((await match.playerGame("Ann"))?.stats ?? []).toEqual([]);
  });

  test("basketball mode scores 1, 2 or 3 points a basket", async ({ newCoach }) => {
    let coach = await newCoach("coach");
    let match = await matchSetup(coach);
    await setTeamStat(coach, match.teamId, "basketballMode", true);
    await match.open();
    await match.lineup("Ann", "Bo", "Cy", "Dee");
    await match.start();

    await match.goal("Ann", 3);
    await match.goal("Ann", 2);
    await match.goal("Bo", 1);

    expect(await match.score()).toBe("6-0");
    expect((await match.playerGame("Ann"))?.stats).toEqual([{ statId: GOAL, count: 5 }]);
    expect((await match.playerGame("Bo"))?.stats).toEqual([{ statId: GOAL, count: 1 }]);
  });

  test("holding a score takes a point back, from the scorer too", async ({ newCoach }) => {
    let match = await matchSetup(await newCoach("coach"));
    await match.lineup("Ann", "Bo", "Cy", "Dee");
    await match.start();
    await match.goal("Ann");
    await match.goal("Bo");
    await match.opponentGoal();
    await match.opponentGoal();

    await match.takeBackGoal("Ann");
    await match.takeBackOpponentGoal();

    expect(await match.score()).toBe("1-1");
    expect(await match.gameState()).toMatchObject({ points: 1, opponentPoints: 1 });
    expect((await match.playerGame("Ann"))?.stats).toEqual([{ statId: GOAL, count: 0 }]);
    expect((await match.playerGame("Bo"))?.stats).toEqual([{ statId: GOAL, count: 1 }]);
  });

  test("with the Goal stat off, holding the score takes a point back", async ({ newCoach }) => {
    let coach = await newCoach("coach");
    let match = await matchSetup(coach);
    await setTeamStat(coach, match.teamId, "goal", false);
    await match.open();
    await match.act("scorePoint", () => match.page.click(".match-bar .score"));
    await match.act("scorePoint", () => match.page.click(".match-bar .score"));

    await match.takeBackPoint();

    expect(await match.score()).toBe("1-0");
  });

  test("a point is only taken back from someone who has it", async ({ newCoach }) => {
    let match = await matchSetup(await newCoach("coach"));
    await match.lineup("Ann", "Bo", "Cy", "Dee");
    await match.goal("Ann");

    await match.takeBackGoal("Bo");
    await expect(match.toast()).toHaveText("Bo doesn't have a goal to take back.");

    await match.takeBackOpponentGoal();
    await expect(match.toast().last()).toHaveText("Points cannot be negative!");

    expect(await match.score()).toBe("1-0");
    expect((await match.playerGame("Ann"))?.stats).toEqual([{ statId: GOAL, count: 1 }]);
  });

  test("bench players show their time against a fair share", async ({ newCoach }) => {
    let match = await matchSetup(await newCoach("coach"));
    await match.lineup("Ann", "Bo", "Cy", "Dee");
    let eve = match.player("Eve").locator(".fair-delta");
    await expect(eve).toHaveText("");

    await match.start();

    // Four spots for six players: Eve's fair share grows at 2/3 of the clock.
    await expect(eve).toHaveText(/^−00:0[1-9] vs fair$/);
  });

  test("an ended game can be restarted and its clock run again", async ({ newCoach }) => {
    let match = await matchSetup(await newCoach("coach"));
    await match.lineup("Ann", "Bo", "Cy", "Dee");
    await match.start();
    await match.end();

    await match.restart();
    expect((await match.gameState())?.status).toBe("paused");
    await expect(match.page.locator("#gameStatus")).toContainText("tap to start");

    await match.start();
    let game = await match.gameState();
    expect(game?.status).toBe("play");
    expect(game?.gameTime).toHaveLength(2);
    expect(isRunning(game?.gameTime)).toBe(true);
  });

  test("deleting a game removes it from the schedule", async ({ newCoach }) => {
    let coach = await newCoach("coach");
    let match = await matchSetup(coach);
    await match.lineup("Ann", "Bo", "Cy", "Dee");
    await match.start();
    await match.goal("Ann");

    await coach.goto(`/web/match?teamId=${match.teamId}&gameId=1`);
    await coach.page.click("button:has-text('Delete')");
    await coach.page.waitForURL(/\/web\/games/);
    await coach.page.waitForLoadState("networkidle");

    await expect(coach.page.locator("#game-1")).toHaveCount(0);
    expect((await coach.idb(["team", match.teamId]))?.games).toEqual([]);
    expect(await match.gameState()).toMatchObject({ points: 0, gameTime: [] });
    let ann = await match.playerGame("Ann");
    expect(ann?.stats ?? []).toEqual([]);
    expect(ann?.gameTime ?? []).toEqual([]);
  });
});

test.describe("moving players during a match", () => {
  test("a field player moved to an empty spot keeps playing there", async ({ newCoach }) => {
    let match = await matchSetup(await newCoach("coach"));
    let names = await match.positionNames();
    await match.lineup("Ann", "Bo", "Cy");
    await match.start();
    await match.page.waitForTimeout(500);

    await match.move("Ann", 3);

    await expect(match.position(0)).toHaveClass(/is-empty/);
    await expect(match.position(3)).toContainText("Ann");
    let ann = await match.playerGame("Ann");
    expect(ann?.status).toEqual({ _: "inPlay", position: 3 });
    expect(ann?.gameTime.map((x) => x.position)).toEqual([names[0], names[3]]);
    expect(playedMs(ann?.gameTime)).toBeGreaterThanOrEqual(500);
    expect(isRunning(ann?.gameTime)).toBe(true);
  });

  test("moving onto another field player swaps the two, clocks running", async ({ newCoach }) => {
    let match = await matchSetup(await newCoach("coach"));
    let names = await match.positionNames();
    await match.lineup("Ann", "Bo", "Cy", "Dee");
    await match.start();

    await match.move("Ann", 1);

    expect(await match.field()).toEqual(["Bo", "Ann", "Cy", "Dee"]);
    let [ann, bo] = [await match.playerGame("Ann"), await match.playerGame("Bo")];
    expect(ann?.status).toEqual({ _: "inPlay", position: 1 });
    expect(bo?.status).toEqual({ _: "inPlay", position: 0 });
    expect(ann?.gameTime.map((x) => x.position)).toEqual([names[0], names[1]]);
    expect(bo?.gameTime.map((x) => x.position)).toEqual([names[1], names[0]]);
    expect(isRunning(ann?.gameTime)).toBe(true);
    expect(isRunning(bo?.gameTime)).toBe(true);
  });

  test("moving players while paused changes only their positions", async ({ newCoach }) => {
    let match = await matchSetup(await newCoach("coach"));
    let names = await match.positionNames();
    await match.lineup("Ann", "Bo", "Cy", "Dee");
    await match.start();
    await match.pause();
    let before = playedMs((await match.playerGame("Ann"))?.gameTime);

    await match.move("Ann", 1);

    expect(await match.field()).toEqual(["Bo", "Ann", "Cy", "Dee"]);
    let ann = await match.playerGame("Ann");
    expect(isRunning(ann?.gameTime)).toBe(false);
    expect(playedMs(ann?.gameTime)).toBe(before);
    expect(ann?.gameTime.at(-1)).toEqual({ position: names[1] });

    await match.start();
    ann = await match.playerGame("Ann");
    expect(ann?.gameTime.at(-1)).toEqual({ start: expect.any(Number), position: names[1] });
    expect((await match.playerGame("Bo"))?.gameTime.at(-1)?.position).toBe(names[0]);
  });

  test("one queued player can be swapped on alone", async ({ newCoach }) => {
    let match = await matchSetup(await newCoach("coach"));
    await match.lineup("Ann", "Bo", "Cy", "Dee");
    await match.start();
    await match.queue("Eve", 0);
    await match.queue("Fay", 1);
    await expect(match.page.locator(".swap-all")).toHaveText("Swap 2");

    await match.swapOne(0);

    expect(await match.field()).toEqual(["Eve", "Bo", "Cy", "Dee"]);
    await expect(match.queued(1)).toContainText("Fay next");
    await expect(match.page.locator(".swap-all")).toHaveText("Swap 1");
    expect((await match.playerGame("Ann"))?.status).toEqual({ _: "out" });
    expect(isRunning((await match.playerGame("Eve"))?.gameTime)).toBe(true);
    expect(isRunning((await match.playerGame("Fay"))?.gameTime)).toBe(false);
  });

  test("a queued player can go to an empty spot alone", async ({ newCoach }) => {
    let match = await matchSetup(await newCoach("coach"));
    await match.lineup("Ann", "Bo", "Cy");
    await match.start();
    await match.queue("Eve", 3);
    await expect(match.position(3)).toHaveClass(/is-queued/);

    await match.swapOne(3);

    expect(await match.field()).toEqual(["Ann", "Bo", "Cy", "Eve"]);
    expect(isRunning((await match.playerGame("Eve"))?.gameTime)).toBe(true);
  });

  test("a queued player sent back to the bench is no longer queued", async ({ newCoach }) => {
    let match = await matchSetup(await newCoach("coach"));
    await match.lineup("Ann", "Bo", "Cy", "Dee");
    await match.queue("Eve", 0);

    await match.cancelQueued(0);

    await expect(match.queued(0)).toHaveCount(0);
    await expect(match.page.locator(".swap-all")).toHaveCount(0);
    expect(await match.bench()).toContain("Eve");
    expect((await match.playerGame("Eve"))?.status).toEqual({ _: "out" });
    expect(await match.field()).toEqual(["Ann", "Bo", "Cy", "Dee"]);
  });

  test("All Out takes everyone off the field and stops their clocks", async ({ newCoach }) => {
    let match = await matchSetup(await newCoach("coach"));
    await match.lineup("Ann", "Bo", "Cy", "Dee");
    await match.start();
    await match.queue("Eve", 0);

    await match.allOut();

    expect(await match.field()).toEqual([]);
    expect((await match.bench()).sort()).toEqual(["Ann", "Bo", "Cy", "Dee", "Eve", "Fay"]);
    for (let name of ["Ann", "Bo", "Cy", "Dee", "Eve"]) {
      let player = await match.playerGame(name);
      expect(player?.status, name).toEqual({ _: "out" });
      expect(isRunning(player?.gameTime), name).toBe(false);
    }
    expect((await match.gameState())?.status).toBe("play");
  });
});
