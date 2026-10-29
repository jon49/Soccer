import { expect, type Coach } from "./fixtures.js";

const PLAYERS = ["Ann", "Bo", "Cy", "Dee", "Eve", "Fay"];

// A team with six players, a four-player formation, and one game.
export async function matchSetup(coach: Coach, players = PLAYERS) {
  let teamId = await coach.createTeam("Hawks", "2026");
  for (let name of players) await coach.addPlayer(teamId, name);

  await coach.goto(`/web/positions?teamId=${teamId}`);
  await coach.page.click("text=Use a template.");
  await coach.page.locator("#templates button").first().click();
  await expect
    .poll(async () => (await coach.idb(["positions", teamId]))?.positions.flat().length)
    .toBe(4);

  await coach.addGame(teamId, "Owls");
  let match = new MatchPage(coach, teamId, 1, players);
  await match.open();
  return match;
}

// The match's play view, driven the way a coach uses it: tap a player, then
// tap where they go.
export class MatchPage {
  constructor(
    readonly coach: Coach,
    readonly teamId: number | string,
    readonly gameId: number,
    readonly players: string[],
  ) {}

  get page() {
    return this.coach.page;
  }

  playerId(name: string) {
    return this.players.indexOf(name) + 1;
  }

  async open() {
    await this.coach.goto(`/web/match?teamId=${this.teamId}&gameId=${this.gameId}&handler=play`);
  }

  // Runs `tap`, then waits for the app's response to the `handler` POST and
  // for the page to be re-rendered with it.
  async act(handler: string, tap: () => Promise<void>) {
    let response = this.page.waitForResponse(
      (x) => x.request().method() === "POST" && x.url().includes(`handler=${handler}`),
    );
    let rendered = this.page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          document.addEventListener("hz:completed", () => resolve(), { once: true }),
        ),
    );
    await tap();
    expect((await response).ok()).toBe(true);
    await rendered;
  }

  player(name: string) {
    return this.page.locator("[data-player-id]", {
      has: this.page.locator(".player-name", { hasText: new RegExp(`^${name}\\b`) }),
    });
  }

  position(index: number) {
    return this.page.locator(`.match-field [data-position="${index}"]`);
  }

  // Bench player -> field position: queues them for that spot.
  async queue(name: string, position: number) {
    await this.player(name).click();
    await this.act("updateUserPosition", () => this.position(position).click());
  }

  async swapAll() {
    await this.act("swapAll", () => this.page.click(".swap-all"));
  }

  // The player queued for `position` (the "next" button in that spot).
  queued(position: number) {
    return this.position(position).locator(".player-next");
  }

  // Queued player, then their own spot: swaps just that one player on.
  async swapOne(position: number) {
    await this.queued(position).click();
    let spot = this.position(position).locator(".player-main, .position-name").first();
    await this.act("swap", () => spot.click());
  }

  async cancelQueued(position: number) {
    await this.queued(position).click();
    await this.act("cancelOnDeck", () => this.page.click("[data-target=bench]"));
  }

  // Field player -> another field position: moves them there, swapping with
  // whoever plays it.
  async move(name: string, position: number) {
    await this.player(name).click();
    await this.act("updateUserPosition", () => this.position(position).click());
  }

  // Fills positions 0.. with `names`, then swaps them all on.
  async lineup(...names: string[]) {
    for (let [i, name] of names.entries()) await this.queue(name, i);
    await this.swapAll();
  }

  async start() {
    await this.act("startGame", () => this.page.click("#gameStatus"));
  }

  async pause() {
    await this.act("pauseGame", () => this.page.click("#gameStatus"));
  }

  async end() {
    await this.act("endGame", () => this.page.click(".match-bar .match-end:has-text('End')"));
  }

  async restart() {
    await this.act("restartGame", () =>
      this.page.click(".match-bar .match-end:has-text('Restart')"),
    );
  }

  async allOut() {
    await this.act("allOut", () => this.page.click("button:has-text('All Out')"));
  }

  // `points` picks 1, 2 or 3 in basketball mode.
  async goal(scorer: string, points?: 1 | 2 | 3) {
    await this.page.click(".match-bar .score[data-status=score]");
    if (points) await this.page.click(`.score-points label:has(input[value="${points}"])`);
    await this.act("scorePoint", () => this.player(scorer).click());
  }

  async goalNoScorer() {
    await this.page.click(".match-bar .score[data-status=score]");
    await this.act("scorePoint", () => this.page.click("[data-target=noScorer]"));
  }

  async opponentGoal() {
    await this.act("oPointsIncPlay", () => this.page.click("#opponentPoints"));
  }

  async toBench(name: string) {
    await this.player(name).click();
    await this.act("playerNowOut", () => this.page.click("[data-target=bench]"));
  }

  async toNotPlaying(name: string) {
    await this.player(name).click();
    await this.act("playerNotPlaying", () => this.page.click("[data-target=notPlaying]"));
  }

  async backFromNotPlaying(name: string) {
    await this.page.click("summary:has-text('Not playing')");
    // Not-playing players are plain form buttons, not tap-to-select players.
    let button = this.page.locator("#notPlayingList button", {
      has: this.page.locator(".player-name", { hasText: new RegExp(`^${name}\\b`) }),
    });
    await this.act("backIn", () => button.click());
  }

  field() {
    return this.page.locator(".match-field .player-main .player-name").allInnerTexts();
  }

  bench() {
    return this.page
      .locator("#outPlayersList .player-name, #onDeckList .player-name")
      .allInnerTexts();
  }

  // Inside a <details> that may be collapsed, so read text, not rendered text.
  async notPlaying() {
    let names = await this.page.locator("#notPlayingList .player-name").allTextContents();
    return names.map((x) => x.trim());
  }

  async score() {
    let ours = await this.page.locator(".match-bar .score .score-value").first().innerText();
    let theirs = await this.page.locator("#opponentPoints .score-value").innerText();
    return `${ours.trim()}-${theirs.trim()}`;
  }

  /*** Saved data ***/

  async positionNames(): Promise<string[]> {
    return (await this.coach.idb(["positions", this.teamId]))!.positions.flat();
  }

  gameState() {
    return this.coach.idb<{
      status?: string;
      points: number;
      opponentPoints: number;
      gameTime: { start: number; end?: number }[];
    }>(["game-state", this.teamId, this.gameId]);
  }

  playerGame(name: string) {
    return this.coach.idb<{
      status?: { _: string; position?: number };
      stats: { statId: number; count: number }[];
      gameTime: { start?: number; end?: number; position: string }[];
    }>(["player-game", this.teamId, this.playerId(name), this.gameId]);
  }
}

// A running interval has a start and no end. (Pausing leaves a position-only
// entry with neither, so the player resumes in the same spot.)
export function isRunning(gameTime: { start?: number; end?: number }[] = []) {
  return gameTime.some((x) => x.start && !x.end);
}

// Total milliseconds of closed intervals; open intervals count as zero.
export function playedMs(gameTime: { start?: number; end?: number }[] = []) {
  return gameTime.reduce((sum, x) => sum + (x.start && x.end ? x.end - x.start : 0), 0);
}

// Team settings on the stats page that change how the match page scores.
export async function setTeamStat(
  coach: Coach,
  teamId: number | string,
  setting: "basketballMode" | "goal",
  on: boolean,
) {
  await coach.goto(`/web/stats/edit/?teamId=${teamId}`);
  let form =
    setting === "basketballMode"
      ? coach.page.locator("form:has(input[name=basketballMode])")
      : coach.page.locator("form:has(input[name=id][value='1'])");
  let input = form.locator("input[type=checkbox]");
  if ((await input.isChecked()) === on) return;
  let handler = setting === "basketballMode" ? "basketballMode" : "updateStat";
  let saved = coach.page.waitForResponse((x) => x.url().includes(`handler=${handler}`));
  await form.locator("label.toggle").click();
  expect((await saved).ok()).toBe(true);
}
