import { test, expect } from "./fixtures.js";
import { matchSetup } from "./match-page.js";

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

  let ann = a.page.locator(".player-row", { has: a.page.locator("input[value=Ann]") });
  let status = ann.locator(".status-toggle button");
  await expect(status).toHaveText("Active");

  // Active, then Inactive, then Sub, then back to Active. Subs aren't counted.
  let tap = () => a.tap("nextStatus", () => status.click());
  await tap();
  await expect(status).toHaveText("Inactive");
  await expect(heading).toHaveText("Players (1)");

  await tap();
  await expect(status).toHaveText("Sub");
  await expect(heading).toHaveText("Players (1)");

  await a.page.reload();
  await expect(status).toHaveText("Sub");
  await expect(heading).toHaveText("Players (1)");
  expect((await a.idb(["team", teamId]))?.players[0]).toMatchObject({ active: true, sub: true });

  await tap();
  await expect(status).toHaveText("Active");
  await expect(heading).toHaveText("Players (2)");
  expect((await a.idb(["team", teamId]))?.players[0]).not.toHaveProperty("sub");
});

test("adding players keeps the Add a player box where it was on the screen", async ({
  newCoach,
}) => {
  let a = await newCoach("a");
  let teamId = await a.createTeam("Hawks", "2026");
  await a.page.setViewportSize({ width: 400, height: 600 });
  await a.goto(`/web/players?teamId=${teamId}`);
  let input = a.page.locator("#newPlayer");
  let top = () => input.evaluate((x) => Math.round(x.getBoundingClientRect().top));

  // Enough players that the box sits low on the screen, with the page scrolled.
  for (let name of ["Ann", "Bo", "Cy", "Dee", "Eve", "Fay", "Gus", "Hal"]) {
    await a.tap("addPlayer", () => input.fill(name).then(() => input.press("Enter")));
  }
  await input.scrollIntoViewIfNeeded();
  let before = await top();
  expect(await a.page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  await a.tap("addPlayer", () => input.fill("Ida").then(() => input.press("Enter")));
  await expect(a.page.locator("input[value=Ida]")).toBeVisible();
  await expect.poll(top).toBe(before);
  await expect(input).toBeFocused();
});

test("a sub plays in a match and is marked as one", async ({ newCoach }) => {
  let coach = await newCoach("coach");
  let match = await matchSetup(coach);
  await coach.goto(`/web/players?teamId=${match.teamId}`);
  let fay = coach.page.locator(".player-row", { has: coach.page.locator("input[value=Fay]") });
  let status = fay.locator(".status-toggle button");
  let tap = () => coach.tap("nextStatus", () => status.click());
  await tap();
  await tap();
  await expect(status).toHaveText("Sub");

  await match.open();
  await expect(match.player("Fay").locator(".sub-mark")).toBeVisible();
  await expect(match.player("Eve").locator(".sub-mark")).toHaveCount(0);

  await match.lineup("Fay", "Bo", "Cy", "Dee");
  expect(await match.field()).toContain("Fay SUB");
});

test("players are listed active, then subs, then inactive, each by name", async ({ newCoach }) => {
  let a = await newCoach("a");
  let teamId = await a.createTeam("Hawks", "2026");
  for (let name of ["Eve", "Dee", "Cy", "Bo", "Ann"]) await a.addPlayer(teamId, name);

  await a.goto(`/web/players?teamId=${teamId}`);
  let status = (name: string) =>
    a.page
      .locator(".player-row", { has: a.page.locator(`input[value=${name}]`) })
      .locator(".status-toggle button");
  let tap = (name: string) => a.tap("nextStatus", () => status(name).click());
  let names = () =>
    a.page
      .locator("#playerCards input[name=name]")
      .evaluateAll((xs) => xs.map((x) => (x as HTMLInputElement).value));
  await tap("Dee"); // Inactive
  await tap("Bo"); // Inactive
  await tap("Bo"); // Sub
  await tap("Ann"); // Inactive
  await tap("Ann"); // Sub
  // A row stays put while its status is tapped.
  expect(await names()).toEqual(["Ann", "Bo", "Cy", "Dee", "Eve"]);

  let order = ["Cy", "Eve", "Ann", "Bo", "Dee"];
  await a.page.reload();
  await expect(status("Ann")).toHaveText("Sub");
  expect(await names()).toEqual(order);

  // The stats tables list active players only, until subs and inactive
  // players are asked for; a tab keeps that choice.
  await a.goto(`/web/stats?teamId=${teamId}`);
  let rows = a.page.locator("#statTables tbody th");
  await expect(rows).toHaveText(["Cy", "Eve"]);
  await a.page.click("#statSubs");
  await expect(rows).toHaveText(["Cy", "Eve", "Ann", "Bo"]);
  await a.page.click("#statInactive");
  await expect(rows).toHaveText(order);
  for (let tab of ["#timePlayed", "#percentagePlayed", "#activitiesPerformed"]) {
    await a.page.click(tab);
    await expect(rows, tab).toHaveText(order);
  }
  await a.page.click("#statSubs");
  await expect(a.page.locator("#statSubs")).toHaveText("Show subs");
  await expect(rows).toHaveText(["Cy", "Eve", "Dee"]);
  await expect(a.page.locator("#activitiesPerformed")).toHaveAttribute("aria-current", "page");
});

test("the Active / Inactive / Sub toggles are in the tab order and work from the keyboard", async ({
  newCoach,
}) => {
  let a = await newCoach("a");
  let teamId = await a.createTeam("Hawks", "2026");
  await a.addPlayer(teamId, "Ann");
  await a.goto(`/web/players?teamId=${teamId}`);
  let { page } = a;
  let teamToggle = page.locator("#team-active .nc-button:visible");
  let status = page.locator(".player-row .status-toggle button");

  // Tab from Year lands on the team's toggle; Space flips it.
  await page.focus("#year-input");
  await page.keyboard.press("Tab");
  await expect(page.locator("#team-active input")).toBeFocused();
  await expect(teamToggle).toHaveText("Active");
  await a.tap("editTeam", () => page.keyboard.press("Space"));
  await expect(teamToggle).toHaveText("Inactive");
  expect((await a.idb(["team", teamId]))?.active).toBe(false);

  // On to the player's number, name, then status, a button: Space steps it
  // Active → Inactive → Sub → Active, and it keeps the focus.
  for (let i = 0; i < 3; i++) await page.keyboard.press("Tab");
  await expect(status).toBeFocused();
  for (let next of ["Inactive", "Sub", "Active"]) {
    await a.tap("nextStatus", () => page.keyboard.press("Space"));
    await expect(status).toHaveText(next);
    await expect(status).toBeFocused();
  }
  await a.tap("nextStatus", () => page.keyboard.press("Enter"));
  await expect(status).toHaveText("Inactive");

  // Renaming the player keeps their status, and Enter in the name field
  // doesn't press the status button.
  let name = page.locator(".player-row input[name=name]");
  await a.tap("editPlayer", () =>
    name
      .fill("Annie")
      .then(() => name.press("Enter"))
      .then(() => name.blur()),
  );
  await expect(status).toHaveText("Inactive");
  expect((await a.idb(["team", teamId]))?.players[0]).toMatchObject({
    name: "Annie",
    active: false,
  });

  await status.focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#newPlayer")).toBeFocused();
});

test("the Team and Players links scroll to their part of the page without drawing it again", async ({
  newCoach,
}) => {
  let a = await newCoach("a");
  let teamId = await a.createTeam("Hawks", "2026");
  for (let name of ["Ann", "Bo", "Cy", "Dee", "Eve", "Fay", "Gus", "Hal", "Ivy", "Jo"]) {
    await a.addPlayer(teamId, name);
  }
  await a.page.setViewportSize({ width: 400, height: 500 });
  await a.goto(`/web/players?teamId=${teamId}`);
  let scrollY = () => a.page.evaluate(() => window.scrollY);
  let top = (id: string) =>
    a.page.locator(`#${id}`).evaluate((x) => Math.abs(Math.round(x.getBoundingClientRect().top)));
  // Where the link is on screen, as a coach taps it (click() would scroll to it first).
  let tapLink = (id: string) =>
    a.page.locator(`a[href='#${id}']`).evaluate((x: HTMLElement) => x.click());
  // A page drawn again would lose this.
  await a.page.evaluate(() => ((document.getElementById("players") as any).marked = true));

  await tapLink("players");
  await expect(a.page).toHaveURL(/#players$/);
  await expect.poll(() => top("players")).toBe(0);
  expect(await scrollY()).toBeGreaterThan(0);

  await tapLink("team");
  await expect(a.page).toHaveURL(/#team$/);
  await expect.poll(() => top("team")).toBe(0);

  // Back goes to the Players heading again, then to where the page was.
  await a.page.goBack();
  await expect(a.page).toHaveURL(/#players$/);
  await expect.poll(() => top("players")).toBe(0);
  await a.page.goBack();
  await expect.poll(scrollY).toBe(0);

  expect(await a.page.evaluate(() => (document.getElementById("players") as any).marked)).toBe(
    true,
  );
});
