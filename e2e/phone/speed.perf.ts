// How quickly the web app responds on a real phone: taps during a match and
// moving from page to page. Run with tasks/measure-speed.sh; results are
// printed, and docs/startup-and-size.html has the last ones.
//
// Playwright drives the phone's own Chrome over remote debugging (forwarded
// by the task). The test data lives on a localhost origin (the dev server on
// this machine, reached through `adb reverse`), so it has storage of its own
// and nothing syncs; that origin's data is wiped at the end. The pages of
// the real site (SOCCER_SITE, empty to skip) are only read.
import { chromium, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { Coach, expect } from "../fixtures.js";
import { PHONE_APP_PORT, PHONE_DEVTOOLS_PORT } from "../env.js";
import { matchSetup } from "../match-page.js";

const BASE = `http://localhost:${PHONE_APP_PORT}`;
const SITE = process.env.SOCCER_SITE ?? "https://soccer.jnyman.com";
const ROUNDS = Number(process.env.ROUNDS ?? 5);

// A Coach whose paths are on the phone's localhost origin. Filling a field
// opens the on-screen keyboard, which shrinks the page so that a click on
// the form's button lands on something else and Playwright retries forever;
// so forms are submitted with Enter, as adding a player already is.
class PhoneCoach extends Coach {
  override async goto(path: string) {
    await this.page.goto(new URL(path, BASE).href);
    await this.page.waitForLoadState("networkidle");
    await drawn(this.page);
  }

  override async createTeam(name: string, year: string): Promise<number> {
    await this.goto("/web/teams");
    await this.page.fill("#name", name);
    await this.page.fill("#year", year);
    await this.page.press("#year", "Enter");
    let link = this.page.locator("#teams > li > a:first-child", { hasText: `${name} - ${year}` });
    await expect(link).toHaveCount(1);
    return +new URL((await link.getAttribute("href"))!, this.page.url()).searchParams.get(
      "teamId",
    )!;
  }

  override async addGame(teamId: number | string, opponent: string, date = "2026-11-01T10:00") {
    await this.goto(`/web/games?teamId=${teamId}`);
    await this.page.fill("#gameDate", date);
    await this.page.fill("#gameOpponent", opponent);
    await this.page.press("#gameOpponent", "Enter");
    await expect(this.page.locator("#games")).toContainText(opponent);
  }
}

// In each page: background auto-sync off (as in the e2e tests), and for every
// action (src/web/app/action.ts), when the tap was, when the action started
// and finished (drawing what it changed), and the next frame after. Times are
// ms on the page's clock.
function probe() {
  if (window !== window.top) return;
  let w = window as any;
  w.e2eAutoSyncOff = true;
  // Runs `f` after the next frame, or after 1 s if the tab draws none.
  let afterFrame = (w.__afterFrame = (f: () => void) => {
    let done = false;
    let run = () => !done && ((done = true), f());
    requestAnimationFrame(() => setTimeout(run));
    setTimeout(run, 1000);
  });
  w.__taps = [];
  let tap = 0;
  addEventListener("pointerdown", () => (tap = performance.now()), true);
  document.addEventListener("app:done", (e) => {
    let detail = (e as CustomEvent).detail as
      | { action: string; started: number; finished: number; failed?: boolean }
      | undefined;
    if (!detail || detail.failed) return;
    let record = {
      handler: detail.action,
      tap,
      started: detail.started,
      finished: detail.finished,
      frame: 0,
    };
    afterFrame(() => {
      record.frame = performance.now();
      w.__taps.push(record);
    });
  });
}

type Tap = {
  handler: string;
  tap: number;
  started: number;
  finished: number;
  frame: number;
};

// Waits for the app shell to draw the page (src/web/app/router.ts), for at
// most 5 s: a build from before the shell draws its pages differently.
async function drawn(page: Page) {
  await page
    .locator("#main > *")
    .first()
    .waitFor({ timeout: 5000 })
    .catch(() => {});
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const ms = (x: number) => `${Math.round(x)} ms`.padStart(7);

function tapReport(name: string, taps: Tap[]) {
  if (!taps.length) return;
  let byHandler = new Map<string, Tap[]>();
  for (let t of taps) byHandler.set(t.handler, [...(byHandler.get(t.handler) ?? []), t]);
  console.log(`\n${name} (median ms): tap → action | action + draw | to next frame | total`);
  for (let [handler, ts] of byHandler) {
    let m = (f: (t: Tap) => number) => ms(median(ts.map(f)));
    console.log(
      `  ${handler.padEnd(22)} ${m((t) => t.started - t.tap)} ${m((t) => t.finished - t.started)} ${m((t) => t.frame - t.finished)} ${m((t) => t.frame - t.tap)}  (${ts.length} taps)`,
    );
  }
  let all = taps.map((t) => t.frame - t.tap);
  console.log(`  all taps: median ${ms(median(all))}, slowest ${ms(Math.max(...all))}`);
}

// Moves to each path in turn the way a link in the app does (the router
// draws the page, no new document), `ROUNDS` times, and reports the time from
// the click to the first frame of the new page.
async function navReport(name: string, page: Page, paths: string[]) {
  await page.goto(new URL(paths.at(-1)!, page.url()).href);
  await page.waitForLoadState("load");
  await drawn(page);
  let rows = new Map<string, number[]>();
  for (let i = 0; i < ROUNDS; i++) {
    for (let path of paths) {
      // A link the router leaves to the browser loads a new document, which
      // ends the evaluate: NaN.
      let ms = await page
        .evaluate(
          (href) =>
            new Promise<number>((resolve) => {
              let a = document.createElement("a");
              a.href = href;
              document.body.append(a);
              let start = performance.now();
              document.addEventListener("app:page", function done() {
                document.removeEventListener("app:page", done);
                (window as any).__afterFrame(() => resolve(performance.now() - start));
              });
              a.click();
              a.remove();
            }),
          path,
        )
        .catch(async (e) => {
          if (!String(e).includes("Execution context was destroyed")) throw e;
          await page.waitForLoadState("load");
          await drawn(page);
          return NaN;
        });
      rows.set(path, [...(rows.get(path) ?? []), ms]);
    }
  }
  console.log(`\n${name} (median ms): click → new page drawn`);
  for (let [path, ts] of rows) {
    let loads = ts.filter((t) => Number.isNaN(t)).length;
    let morphed = ts.filter((t) => !Number.isNaN(t));
    console.log(
      `  ${path.replace(/[?&](teamId|gameId)=[^&]+/g, "").padEnd(22)} ${morphed.length ? ms(median(morphed)) : "      -"}${loads ? `  (${loads} of ${ts.length} loaded as a new document)` : ""}`,
    );
  }
}

// Opens each path in turn, `ROUNDS` times, and reports its navigation timing.
async function pageReport(name: string, page: Page, base: string, paths: string[]) {
  let rows = new Map<string, number[][]>();
  for (let i = 0; i < ROUNDS; i++) {
    for (let path of paths) {
      await page.goto(new URL(path, base).href);
      await page.waitForLoadState("load");
      await drawn(page);
      let t = await page.evaluate(
        () =>
          new Promise<number[]>((resolve) =>
            (window as any).__afterFrame(() => {
              let ready = performance.getEntriesByName("app:page")[0]?.startTime ?? NaN;
              let n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
              let fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? NaN;
              resolve([
                n.responseStart - (n.workerStart || n.fetchStart),
                n.responseStart,
                fcp,
                n.loadEventEnd,
                ready,
              ]);
            }),
          ),
      );
      rows.set(path, [...(rows.get(path) ?? []), t]);
    }
  }
  console.log(
    `\n${name} (median ms): service worker | navigation → answered | → first paint | → loaded | → page drawn`,
  );
  for (let [path, ts] of rows) {
    let m = (i: number) => ms(median(ts.map((t) => t[i])));
    console.log(
      `  ${path.replace(/[?&](teamId|gameId)=[^&]+/g, "").padEnd(22)} ${m(0)} ${m(1)} ${m(2)} ${m(3)} ${m(4)}`,
    );
  }
}

// Closes the tab through Chrome's /json/close endpoint: page.close() on the
// phone can hang and leave the tab open.
async function closeTab(page: Page) {
  let cdp = await page.context().newCDPSession(page);
  let { targetInfo } = await cdp.send("Target.getTargetInfo");
  await fetch(`http://127.0.0.1:${PHONE_DEVTOOLS_PORT}/json/close/${targetInfo.targetId}`);
}

let browser: Browser;
let context: BrowserContext;

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${PHONE_DEVTOOLS_PORT}`);
  context = browser.contexts()[0];
});

test("match taps and pages, test data", async () => {
  let page = await context.newPage();
  await page.bringToFront();
  page.on("dialog", (x) => x.accept());
  await page.addInitScript(probe);
  // Only the localhost origin's data: its service worker, caches and
  // IndexedDB. Before, in case a run stopped before wiping it, and after.
  let cdp = await context.newCDPSession(page);
  let wipe = () => cdp.send("Storage.clearDataForOrigin", { origin: BASE, storageTypes: "all" });
  await wipe();
  try {
    let coach = new PhoneCoach("phone", context, page);
    // The first visit installs the service worker.
    await coach.goto("/web/");
    await coach.serviceWorker();
    let match = await matchSetup(coach);
    await match.lineup("Ann", "Bo", "Cy", "Dee");
    await match.start();
    await page.evaluate(() => ((window as any).__taps = []));

    for (let i = 0; i < ROUNDS; i++) {
      await match.queue("Eve", 0);
      await match.swapAll();
      await match.queue("Ann", 0);
      await match.swapAll();
      await match.opponentGoal();
      await match.pause();
      await match.start();
    }
    await page.waitForTimeout(500);
    tapReport("Match taps", await page.evaluate(() => (window as any).__taps));

    // A tap outside a match: the stats tabs, each drawing its table.
    await coach.goto(`/web/stats?teamId=${match.teamId}`);
    await page.evaluate(() => ((window as any).__taps = []));
    for (let i = 0; i < ROUNDS; i++) {
      for (let tab of ["percentagePlayed", "activitiesPerformed", "timePlayed"]) {
        await coach.tap("tab", () => page.click(`#${tab}`));
      }
    }
    await page.waitForTimeout(500);
    tapReport("Stats tabs", await page.evaluate(() => (window as any).__taps));

    let t = match.teamId;
    await pageReport("Pages, test data", page, BASE, [
      "/web/teams",
      `/web/players?teamId=${t}`,
      `/web/games?teamId=${t}`,
      `/web/match?teamId=${t}&gameId=1&handler=play`,
      `/web/stats?teamId=${t}`,
      `/web/positions?teamId=${t}`,
      "/web/settings",
    ]);
    await navReport("Moving between pages in the app, test data", page, [
      "/web/teams",
      `/web/players?teamId=${t}`,
      `/web/games?teamId=${t}`,
      `/web/match?teamId=${t}&gameId=1`,
      `/web/stats?teamId=${t}`,
      `/web/positions?teamId=${t}`,
    ]);
  } finally {
    await wipe();
    await closeTab(page);
  }
});

test("pages, real data (read only)", async () => {
  test.skip(!SITE, "SOCCER_SITE is empty");
  let page = await context.newPage();
  await page.bringToFront();
  await page.addInitScript(probe);
  try {
    await page.goto(new URL("/web/teams", SITE).href);
    let href = await page.locator("#teams > li > a:first-child").first().getAttribute("href");
    test.skip(!href, "no teams on the real site");
    let t = new URL(href!, SITE).searchParams.get("teamId");
    await pageReport("Pages, real data", page, SITE, [
      "/web/teams",
      `/web/players?teamId=${t}`,
      `/web/games?teamId=${t}`,
      `/web/stats?teamId=${t}`,
      `/web/positions?teamId=${t}`,
      "/web/settings",
    ]);
  } finally {
    await closeTab(page);
  }
});
