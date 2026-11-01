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
// htmz response, when the tap was, when the service worker got the request
// and answered, when the response had loaded in the htmz iframe, when it was
// merged into the page, and the next frame after. Times are ms on the page's
// clock.
function probe() {
  if (window !== window.top) return;
  let fetch_ = window.fetch;
  window.fetch = (input, init) =>
    String(input instanceof Request ? input.url : input).includes("handler=auto")
      ? Promise.resolve(new Response(null, { status: 204 }))
      : fetch_(input, init);

  let w = window as any;
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
  document.addEventListener(
    "hz:completed",
    (e) => {
      // Fired after merging. A tap the page handled itself (match.bundle.ts)
      // names its handler and when it started and finished rendering; for
      // one the service worker answered, the htmz iframe still holds the
      // response, and its navigation timing has the rest.
      let merged = performance.now();
      let local = (e as CustomEvent).detail as
        | { handler: string; started: number; rendered: number }
        | undefined;
      if (local?.handler) {
        let record = {
          handler: local.handler,
          inPage: true,
          tap,
          request: local.started,
          answered: local.rendered,
          loaded: local.rendered,
          merged,
          frame: 0,
        };
        afterFrame(() => {
          record.frame = performance.now();
          w.__taps.push(record);
        });
        return;
      }
      let frame = document.querySelector<HTMLIFrameElement>("iframe[name=htmz]")?.contentWindow;
      let nav = frame?.performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
      if (!frame || !nav) return;
      let at = (t: number) => frame.performance.timeOrigin - performance.timeOrigin + t;
      let record = {
        handler: new URL(frame.location.href).searchParams.get("handler") ?? "?",
        inPage: false,
        tap,
        request: at(nav.workerStart || nav.fetchStart),
        answered: at(nav.responseStart),
        loaded: at(nav.loadEventStart),
        merged,
        frame: 0,
      };
      afterFrame(() => {
        record.frame = performance.now();
        w.__taps.push(record);
      });
    },
    true,
  );
}

type Tap = {
  handler: string;
  inPage: boolean;
  tap: number;
  request: number;
  answered: number;
  loaded: number;
  merged: number;
  frame: number;
};

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const ms = (x: number) => `${Math.round(x)} ms`.padStart(7);

function tapReport(taps: Tap[]) {
  for (let inPage of [true, false]) {
    let some = taps.filter((t) => t.inPage === inPage);
    if (!some.length) continue;
    let byHandler = new Map<string, Tap[]>();
    for (let t of some) byHandler.set(t.handler, [...(byHandler.get(t.handler) ?? []), t]);
    console.log(
      inPage
        ? "\nMatch taps, handled in the page (median ms): tap → handler | handler + render | merge | to next frame | total"
        : "\nMatch taps, through the service worker (median ms): tap → request | service worker | response loads | merge | to next frame | total",
    );
    for (let [handler, ts] of byHandler) {
      let m = (f: (t: Tap) => number) => ms(median(ts.map(f)));
      let parts = inPage
        ? [m((t) => t.request - t.tap), m((t) => t.answered - t.request)]
        : [
            m((t) => t.request - t.tap),
            m((t) => t.answered - t.request),
            m((t) => t.loaded - t.answered),
          ];
      console.log(
        `  ${handler.padEnd(22)} ${parts.join(" ")} ${m((t) => t.merged - t.loaded)} ${m((t) => t.frame - t.merged)} ${m((t) => t.frame - t.tap)}  (${ts.length} taps)`,
      );
    }
    let all = some.map((t) => t.frame - t.tap);
    console.log(`  all taps: median ${ms(median(all))}, slowest ${ms(Math.max(...all))}`);
  }
}

// Moves to each path in turn the way a link in the app does (htmz-nav: the
// page is fetched and morphed in, no new document), `ROUNDS` times, and
// reports the time from the click to the first frame of the new page. Pages
// that need a normal load (other scripts, like Settings) are left out.
async function navReport(name: string, page: Page, paths: string[]) {
  await page.goto(new URL(paths.at(-1)!, page.url()).href);
  await page.waitForLoadState("load");
  let rows = new Map<string, number[]>();
  for (let i = 0; i < ROUNDS; i++) {
    for (let path of paths) {
      let ms = await page.evaluate(
        (href) =>
          new Promise<number>((resolve) => {
            let a = document.createElement("a");
            a.href = href;
            a.target = "_self";
            document.body.append(a);
            let start = performance.now();
            document.addEventListener("hz:completed", function done(e) {
              if (!(e as CustomEvent).detail?.navigation) return;
              document.removeEventListener("hz:completed", done);
              (window as any).__afterFrame(() => resolve(performance.now() - start));
            });
            a.click();
          }),
        path,
      );
      rows.set(path, [...(rows.get(path) ?? []), ms]);
    }
  }
  console.log(`\n${name} (median ms): click → new page drawn`);
  for (let [path, ts] of rows) {
    console.log(`  ${path.replace(/[?&](teamId|gameId)=[^&]+/g, "").padEnd(22)} ${ms(median(ts))}`);
  }
}

// Opens each path in turn, `ROUNDS` times, and reports its navigation timing.
async function pageReport(name: string, page: Page, base: string, paths: string[]) {
  let rows = new Map<string, number[][]>();
  for (let i = 0; i < ROUNDS; i++) {
    for (let path of paths) {
      await page.goto(new URL(path, base).href);
      await page.waitForLoadState("load");
      let t = await page.evaluate(
        () =>
          new Promise<number[]>((resolve) =>
            (window as any).__afterFrame(() => {
              let n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
              let fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? NaN;
              resolve([
                n.responseStart - (n.workerStart || n.fetchStart),
                n.responseStart,
                fcp,
                n.loadEventEnd,
              ]);
            }),
          ),
      );
      rows.set(path, [...(rows.get(path) ?? []), t]);
    }
  }
  console.log(
    `\n${name} (median ms): service worker | navigation → answered | → first paint | → loaded`,
  );
  for (let [path, ts] of rows) {
    let m = (i: number) => ms(median(ts.map((t) => t[i])));
    console.log(
      `  ${path.replace(/[?&](teamId|gameId)=[^&]+/g, "").padEnd(22)} ${m(0)} ${m(1)} ${m(2)} ${m(3)}`,
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
    // The loader at /web/ installs the service worker; until then the app's
    // other pages are 404s.
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
    tapReport(await page.evaluate(() => (window as any).__taps));

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
