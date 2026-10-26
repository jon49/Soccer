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

  async goal(scorer: string) {
    await this.page.click(".match-bar .score[data-status=score]");
    await this.act("scorePoint", () => this.player(scorer).click());
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
    let ours = await this.page.locator(".match-bar .score").first().innerText();
    let theirs = await this.page.locator("#opponentPoints").innerText();
    return `${ours.trim()}-${theirs.trim()}`;
  }

  /*** Saved data ***/

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
