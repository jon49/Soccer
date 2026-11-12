import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { matchSetup } from "./match-page.js";
import { renderScheduleHtml } from "../src/web/pages/schedule-html.js";

// WCAG 2.2 AAA contrast (1.4.6) on every page, in light and dark: text at
// least 7:1 against what's behind it, large text (24px, or 18.66px bold) at
// least 4.5:1. Form fields' edges must reach 3:1 (1.4.11, which has no AAA
// level). Contrast is a ratio of luminance, so passing in color also passes
// with the phone's grayscale filter on.
//
// SHOTS=<dir> also saves a grayscale screenshot of each page there, for
// looking over by eye.

const SHOTS = process.env.SHOTS;

for (let scheme of ["light", "dark"] as const) {
  test(`every page meets AAA contrast in ${scheme} mode`, async ({ newCoach }) => {
    test.setTimeout(180_000);
    let coach = await newCoach(`contrast-${scheme}`);
    let { page } = coach;
    await page.emulateMedia({ colorScheme: scheme });
    let failures: string[] = [];
    let check = async (label: string) => {
      failures.push(...(await lowContrast(page)).map((x) => `${label}: ${x}`));
      if (SHOTS) await grayscaleShot(page, `${SHOTS}/${scheme}-${label}.png`);
    };

    await page.goto("/register/");
    await page.waitForLoadState("networkidle");
    await check("register");
    await page.goto("/login/");
    await page.waitForLoadState("networkidle");
    await check("login");

    let match = await matchSetup(coach);
    let { teamId } = match;
    await coach.addGame(teamId, "Larks", "2026-01-10T10:00");
    await coach.addGame(teamId, "Ravens", "2099-01-10T10:00");

    await coach.goto("/web/teams");
    await check("teams");

    // Eve to Inactive, Fay on to Sub.
    await coach.goto(`/web/players?teamId=${teamId}`);
    let status = (name: string) =>
      page
        .locator(".player-row", { has: page.locator(`input[value="${name}"]`) })
        .locator(".status-toggle label:visible");
    await coach.tap("editPlayer", () => status("Eve").click());
    await coach.tap("editPlayer", () => status("Fay").click());
    await coach.tap("editPlayer", () => status("Fay").click());
    await expect(status("Fay")).toHaveText("Sub");
    await check("players");
    await page.click(".help-button");
    await expect(page.locator("#pageHelp")).toBeVisible();
    await check("players-help");
    await page.keyboard.press("Escape");

    await coach.goto(`/web/games?teamId=${teamId}`);
    await page.locator(".game-edit summary").first().click();
    await check("games");

    await coach.goto(`/web/positions?teamId=${teamId}`);
    await page.click("text=Use a template.");
    await check("positions");

    await coach.goto(`/web/stats?teamId=${teamId}`);
    await check("stats");
    await coach.goto(`/web/stats/edit?teamId=${teamId}`);
    await check("stats-edit");
    await coach.goto(`/web/share?teamId=${teamId}`);
    await check("share");
    await coach.goto("/web/settings");
    await check("settings");

    await match.open();
    await check("match-new");
    await page.click(".match-bar .help-button");
    await expect(page.locator("#pageHelp")).toBeVisible();
    await check("match-help");
    await page.keyboard.press("Escape");
    await match.lineup("Ann", "Bo", "Cy", "Dee");
    await match.start();
    await match.queue("Fay", 0);
    await check("match-playing");
    await page.click(".match-bar .score[data-status=score]");
    await check("match-scoring");
    await page.click(".match-bar .score[data-status=score]");
    await match.player("Bo").click();
    await check("match-selecting");
    await match.player("Bo").click();

    // Shade a player further and further past their fair share of the game,
    // and a bench player further behind it.
    for (let step = 0; step <= 10; step++) {
      await shadeAhead(page, step / 10);
      failures.push(...(await lowContrast(page)).map((x) => `match-shaded ${step / 10}: ${x}`));
    }
    if (SHOTS) await grayscaleShot(page, `${SHOTS}/${scheme}-match-shaded.png`);

    await match.pause();
    await check("match-paused");

    await page.setContent(
      renderScheduleHtml(
        {
          id: 1,
          name: "Hawks",
          year: "2026",
          active: true,
          players: [{ id: 1, name: "Ann", active: true }],
          positions: [],
          games: [
            {
              id: 1,
              date: "2026-01-10",
              time: "10:00",
              home: true,
              opponent: "Owls",
              location: "Field 3",
            },
            { id: 2, date: "2026-11-10", home: false, opponent: "Larks" },
            { id: 3, date: "2099-01-10", home: true, opponent: "Ravens" },
          ],
          _rev: 0,
          _v: 0,
        },
        [{ gameId: 1, points: 3, opponentPoints: 1, gameTime: [], status: "ended", _rev: 0 }],
        [{ gameId: 1, playerId: 1, points: 2 }],
      ),
    );
    await check("schedule");
    await page.click(".score-button");
    await check("schedule-scorers");

    expect(failures).toEqual([]);
  });
}

// Sets every field player's time `fraction` of a full shade past their fair
// share and every bench player's the same behind it, then waits for the
// game timers' next tick to shade them (game-timer.js).
async function shadeAhead(page: Page, fraction: number) {
  await page.evaluate((fraction) => {
    for (let el of document.querySelectorAll<HTMLElement>(
      ".game-shader [data-fair-share], .game-shader[data-fair-share]",
    )) {
      let now = Date.now();
      let gameTotal =
        +(el.dataset.gameTotal || 0) + (el.dataset.gameStart ? now - +el.dataset.gameStart : 0);
      let scale = +(el.dataset.shadeScale || 0) || 8 * 60e3;
      let running = el.dataset.start ? now - +el.dataset.start : 0;
      let fair = gameTotal * +(el.dataset.fairShare || 1);
      let sign = el.closest(".match-field") ? 1 : -1;
      el.dataset.total = String(Math.max(0, fair + sign * fraction * scale - running));
    }
  }, fraction);
  await page.waitForTimeout(1_100);
}

async function grayscaleShot(page: Page, path: string) {
  await page.addStyleTag({ content: "html { filter: grayscale(1); }" });
  await page.screenshot({ path, fullPage: true });
  await page.evaluate(() => document.querySelector("style:last-of-type")?.remove());
}

// Every visible piece of text, form field and placeholder that falls short,
// checked at the start and the middle of any running animation (the paused
// clock flashes).
async function lowContrast(page: Page): Promise<string[]> {
  let found = new Set<string>();
  for (let at of [0, 1000]) {
    for (let x of await page.evaluate(scan, at)) found.add(x);
  }
  return [...found];
}

function scan(at: number): string[] {
  for (let a of document.getAnimations()) {
    try {
      if (a instanceof CSSTransition) a.finish();
      else {
        a.pause();
        a.currentTime = at;
      }
    } catch {}
  }

  let canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  let cx = canvas.getContext("2d", { willReadFrequently: true })!;
  type RGBA = [number, number, number, number];
  let rgba = (color: string): RGBA => {
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = "#000";
    cx.fillStyle = color;
    cx.fillRect(0, 0, 1, 1);
    let d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  let over = (top: RGBA, under: RGBA): RGBA => {
    let a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1) as RGBA;
  };
  let luminance = (c: RGBA) => {
    let [r, g, b] = c.slice(0, 3).map((v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  let ratio = (a: RGBA, b: RGBA) => {
    let [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  let css = (c: RGBA) => `rgb(${c.slice(0, 3).map(Math.round).join(" ")})`;

  // What's behind `el`: its and its ancestors' background colors, stacked,
  // and the opacity of the elements between it and the first solid one.
  let behind = (el: Element | null): { bg: RGBA; opacity: number } => {
    let layers: RGBA[] = [];
    let opacity = 1;
    for (; el; el = el.parentElement) {
      let style = getComputedStyle(el);
      let color = rgba(style.backgroundColor);
      if (color[3] > 0) layers.push(color);
      if (color[3] >= 1) break;
      opacity *= +style.opacity;
    }
    let bg: RGBA = [255, 255, 255, 1];
    for (let layer of layers.reverse()) bg = over(layer, bg);
    return { bg, opacity };
  };
  let describe = (el: Element) => {
    let classes = [...el.classList].slice(0, 3).join(".");
    return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (classes ? `.${classes}` : "");
  };

  let problems: string[] = [];
  let report = (el: Element, text: string, color: string, fontSize: string, fontWeight: string) => {
    let { bg, opacity } = behind(el);
    let fg = rgba(color);
    fg[3] *= opacity;
    let fgOnBg = over(fg, bg);
    let px = parseFloat(fontSize);
    let large = px >= 24 || (px >= 18.66 && +fontWeight >= 700);
    let need = large ? 4.5 : 7;
    let r = ratio(fgOnBg, bg);
    if (r < need) {
      problems.push(
        `"${text.trim().slice(0, 24)}" ${r.toFixed(2)} < ${need} (${css(fgOnBg)} on ${css(bg)}) ${describe(el)}`,
      );
    }
  };
  let shown = (el: Element) =>
    el.checkVisibility({ visibilityProperty: true }) &&
    el.getClientRects().length > 0 &&
    !el.closest("[aria-disabled=true], :disabled, svg, option, script, style, template");

  let walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    let el = node.parentElement;
    if (!el || !node.textContent?.trim() || !shown(el)) continue;
    let style = getComputedStyle(el);
    report(el, node.textContent, style.color, style.fontSize, style.fontWeight);
  }

  for (let el of document.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >(
    "input:not([type=checkbox], [type=radio], [type=hidden], [type=range], [type=color]), textarea, select",
  )) {
    if (!shown(el)) continue;
    let style = getComputedStyle(el);
    let value = el instanceof HTMLSelectElement ? (el.selectedOptions[0]?.text ?? "") : el.value;
    if (value) report(el, value, style.color, style.fontSize, style.fontWeight);
    else if ("placeholder" in el && el.placeholder) {
      let ph = getComputedStyle(el, "::placeholder");
      report(el, el.placeholder, ph.color, ph.fontSize, ph.fontWeight);
    }
    // The field's edge: its border against the page, or its fill against it.
    let page = behind(el.parentElement).bg;
    let fill = over(rgba(style.backgroundColor), page);
    let edge = Math.max(ratio(over(rgba(style.borderTopColor), fill), page), ratio(fill, page));
    if (edge < 3)
      problems.push(
        `field edge ${edge.toFixed(2)} < 3 (${css(over(rgba(style.borderTopColor), fill))} on ${css(page)}) ${describe(el)}`,
      );
  }
  return problems;
}
