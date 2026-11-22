import { test, expect } from "./fixtures.js";

const iphoneSafari =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

test.describe("installing the app", () => {
  test("the Teams page's Install tab opens this device's steps", async ({ newCoach }) => {
    let coach = await newCoach("coach");
    let { page } = coach;
    let teamId = await coach.createTeam("Hawks", "2026");
    let tabs = page.locator("header nav").nth(1).locator("a");

    // Only on the Teams page, not a team's.
    await coach.goto(`/web/players?teamId=${teamId}`);
    await expect(tabs).toHaveText(["Teams", "Players", "Games", "Stats", "Formation"]);
    await coach.goto("/web/teams");
    await expect(tabs).toHaveText(["Teams", "Install"]);

    await tabs.getByText("Install").click();
    await expect(page).toHaveURL(/\/web\/install$/);
    await expect(tabs).toHaveText(["Teams", "Install"]);

    // Playwright's Chromium: a computer running Chrome. Its steps come first
    // and open; the rest are there, closed.
    let howTos = page.locator("#installSteps details");
    await expect(howTos.first()).toHaveAttribute("data-device", "desktop-chrome");
    await expect(howTos.first()).toHaveAttribute("open", "");
    await expect(howTos.first().locator("summary")).toContainText("This device");
    await expect(page.locator("#installSteps details[open]")).toHaveCount(1);
    await expect(howTos).toHaveCount(8);
    await expect(page.locator("#installDetected")).toBeVisible();
    await expect(page.locator(".installed-note")).toBeHidden();

    // Another device's steps open on a tap.
    let samsung = page.locator('[data-device="android-samsung"]');
    await samsung.locator("summary").click();
    await expect(samsung.getByText("Add page to")).toBeVisible();

    // Once installed, the page says so and keeps the steps for other devices.
    await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    await expect(page.locator(".installed-note")).toBeVisible();
    await expect(page.locator("#installSteps")).toBeVisible();
    await expect(tabs).toHaveText(["Teams", "Install"]);
  });

  test("knows an iPhone", async ({ newCoach }) => {
    let coach = await newCoach("coach");
    let { page } = coach;
    await page.addInitScript((ua) => {
      Object.defineProperty(navigator, "userAgent", { get: () => ua });
    }, iphoneSafari);

    await coach.goto("/web/install");
    let first = page.locator("#installSteps details").first();
    await expect(first).toHaveAttribute("data-device", "ios-safari");
    await expect(first).toHaveAttribute("open", "");
    await expect(first.getByText("Add to Home Screen")).toBeVisible();
  });

  test("the manifest's icons are square PNGs of the sizes it says", async ({ page }) => {
    await page.goto("/web/manifest.json");
    let manifest = await (await page.request.get("/web/manifest.json")).json();
    let pngs = manifest.icons.filter((x: { type: string }) => x.type === "image/png");
    expect(pngs.map((x: { sizes: string }) => x.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
    for (let icon of pngs) {
      let size = await page.evaluate(async (src) => {
        let img = new Image();
        img.src = src;
        await img.decode();
        return `${img.naturalWidth}x${img.naturalHeight}`;
      }, icon.src);
      expect(size, icon.src).toBe(icon.sizes);
    }
  });
});
