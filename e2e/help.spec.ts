import { test, expect, type Coach } from "./fixtures.js";
import { MatchPage } from "./match-page.js";

// The Getting started step to do next.
function nextStep(coach: Coach) {
  return coach.page.locator("#setupGuide [aria-current=step]");
}

test.describe("help for new coaches", () => {
  test("Getting started leads from a new team to its first match", async ({ newCoach }) => {
    let coach = await newCoach("coach");
    let { page } = coach;

    await coach.goto("/web/teams");
    await expect(page.locator("#noTeams.welcome")).toContainText("Welcome!");

    let teamId = await coach.createTeam("Hawks", "2026");
    await expect(page.locator("#noTeams")).toHaveCount(0);
    let setup = page.locator("#teams .team-setup");
    await expect(setup).toHaveText("Next step: Add players");
    await setup.locator("a").click();
    await expect(page).toHaveURL(new RegExp(`/web/players\\?teamId=${teamId}$`));

    // The page's help is behind the header's ?; the guide moves on in place.
    let pageHelp = page.locator("#pageHelp");
    await expect(pageHelp).toBeHidden();
    await page.click(".help-button");
    await expect(pageHelp).toBeVisible();
    await expect(pageHelp).toContainText("Sub");
    await pageHelp.getByRole("button", { name: "Close" }).click();
    await expect(pageHelp).toBeHidden();
    await expect(nextStep(coach)).toContainText("Add players");
    await page.fill("#newPlayer", "Ann");
    await page.press("#newPlayer", "Enter");
    await expect(nextStep(coach)).toContainText("Set up a formation");
    await coach.addPlayer(teamId, "Bo");

    await coach.goto(`/web/positions?teamId=${teamId}`);
    await expect(nextStep(coach)).toContainText("Set up a formation");
    await page.click("text=Use a template.");
    await page.locator("#templates button").first().click();
    await expect(nextStep(coach)).toContainText("Add a game");

    await coach.addGame(teamId, "Owls", "2099-11-01T10:00");
    await expect(nextStep(coach)).toContainText("Run the match");
    await expect(nextStep(coach).locator("a")).toHaveAttribute(
      "href",
      `/web/match?teamId=${teamId}&gameId=1`,
    );

    let match = new MatchPage(coach, teamId, 1, ["Ann", "Bo"]);
    await match.open();
    // The match's help is behind the ? after End.
    let help = page.locator("#pageHelp");
    await expect(help).toBeHidden();
    await page.click(".match-bar .help-button");
    await expect(help).toContainText("How to run the match");
    await expect(help).toContainText("Put a player on");
    await page.keyboard.press("Escape");
    await expect(help).toBeHidden();
    await match.lineup("Ann", "Bo");
    await match.start();

    // Done: the guide and the card's next step are gone.
    await coach.goto(`/web/games?teamId=${teamId}`);
    await expect(page.locator("#setupGuide")).toBeEmpty();
    await coach.goto("/web/teams");
    await expect(page.locator("#teams .team-setup")).toHaveCount(0);
  });

  test("Settings can turn the guide off", async ({ newCoach }) => {
    let coach = await newCoach("coach");
    let { page } = coach;
    let teamId = await coach.createTeam("Hawks", "2026");

    await coach.goto("/web/settings");
    await page.getByLabel("Show the Getting started steps").uncheck();
    await expect
      .poll(async () => (await coach.idb<{ hideHelp?: boolean }>("settings"))?.hideHelp)
      .toBe(true);

    // The guide goes; the header's ? stays.
    await coach.goto(`/web/players?teamId=${teamId}`);
    await expect(page.locator("#subheading")).toBeVisible();
    await expect(page.locator("#setupGuide")).toBeEmpty();
    await expect(page.locator(".help-button")).toBeVisible();
    await coach.goto("/web/teams");
    await expect(page.locator("#teams .team-setup")).toHaveCount(0);
    await expect(page.locator(".help-button")).toBeVisible();
    // Settings has no help of its own, so no ?.
    await coach.goto("/web/settings");
    await expect(page.locator(".help-button")).toBeHidden();

    await page.getByLabel("Show the Getting started steps").check();
    await expect
      .poll(async () => (await coach.idb<{ hideHelp?: boolean }>("settings"))?.hideHelp)
      .toBe(false);
    await coach.goto(`/web/players?teamId=${teamId}`);
    await expect(nextStep(coach)).toContainText("Add players");
  });
});
