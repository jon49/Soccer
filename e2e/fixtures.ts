import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { API_PORT, DEPOT } from "./env.js";

const PASSWORD = "E2eTest!12345";

export function sql(query: string): string {
  return execFileSync("sqlite3", [`${DEPOT}data/main.db`, query], { encoding: "utf8" }).trim();
}

// Hex form of a uuid, as TrailBase stores it in BLOB id columns.
export const hex = (uuid: string) => uuid.replace(/-/g, "").toUpperCase();

// Makes `email` the "soccer" app owner (only the owner may publish a personal
// team's schedule). There's one owner per app, so this replaces any other.
export function makeAppOwner(email: string) {
  sql(`INSERT INTO app_owners (app, owner) SELECT 'soccer', id FROM _user WHERE email = '${email}'
       ON CONFLICT(app) DO UPDATE SET owner = excluded.owner;`);
}

// Signs up through the API like a coach would, then marks the address
// verified (unverified users can't log in). `trail user add` would do both,
// but fails with an internal error as of TrailBase v0.35. Plain sqlite3 lacks
// the is_email() that _user's CHECK constraints call, so skip those.
async function registerVerified(email: string) {
  let res = await fetch(`http://localhost:${API_PORT}/api/auth/v1/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, password_repeat: PASSWORD }),
  });
  expect(res.ok, `register ${email}: ${res.status}`).toBe(true);
  sql(`PRAGMA ignore_check_constraints = ON;
       UPDATE _user SET email = unverified_email, unverified_email = NULL
       WHERE unverified_email = '${email}';`);
}

export interface SyncResult {
  status: number;
  messages: string[];
}

// One coach on one device: a logged-in browser context of its own.
export class Coach {
  constructor(
    readonly email: string,
    readonly context: BrowserContext,
    readonly page: Page,
  ) {}

  static async create(browser: Browser, email: string) {
    let context = await browser.newContext();
    // Background auto-sync reloads the page whenever the server has new data,
    // which races with clicks. Tests sync explicitly with `sync()` instead.
    await context.addInitScript(() => {
      let fetch_ = window.fetch;
      window.fetch = (input, init) =>
        String(input instanceof Request ? input.url : input).includes("handler=auto")
          ? Promise.resolve(new Response(null, { status: 204 }))
          : fetch_(input, init);
    });
    let page = await context.newPage();
    page.on("dialog", (x) => x.accept());
    return new Coach(email, context, page);
  }

  async goto(path: string) {
    await this.page.goto(path);
    await this.page.waitForLoadState("networkidle");
  }

  async login() {
    await this.page.goto("/login/");
    await this.fillLogin();
    // /web/?login=success -> /web/ -> /web/teams
    await this.page.waitForURL(/\/web\/teams/);
    await this.serviceWorker();
  }

  async fillLogin() {
    await this.page.fill("#email", this.email);
    await this.page.fill("#password", PASSWORD);
    await this.page.click("button[type=submit]");
  }

  // The first visit installs the service worker; until it controls the page,
  // /web/ requests don't reach the app.
  async serviceWorker() {
    await expect
      .poll(
        async () => {
          try {
            let ok = await this.page.evaluate(() => !!navigator.serviceWorker?.controller);
            if (!ok) await this.page.reload();
            return ok;
          } catch {
            // The page navigated mid-check (e.g. a client-side redirect).
            return false;
          }
        },
        { timeout: 20_000 },
      )
      .toBe(true);
  }

  async logout() {
    await this.page.goto("/login/?logout");
    // Clears the tokens, then /web/?loggedOut=true -> /web/ -> /web/teams.
    await this.page.waitForURL(/\/web\/teams/);
    await this.page.waitForLoadState("networkidle");
    expect(await this.idb("auth_token")).toBeFalsy();
  }

  async sync(): Promise<SyncResult> {
    return this.page.evaluate(async () => {
      let res = await fetch("/web/api/sync?handler=force", {
        method: "POST",
        headers: { "HF-Request": "true" },
      });
      let doc = new DOMParser().parseFromString(await res.text(), "text/html");
      let messages = Array.from(
        doc.querySelectorAll("#toasts .message"),
        (x) => x.textContent ?? "",
      );
      return { status: res.status, messages };
    });
  }

  async goOffline(offline = true) {
    await this.context.setOffline(offline);
  }

  /*** Teams ***/

  async createTeam(name: string, year: string): Promise<number> {
    await this.goto("/web/teams");
    await this.page.fill("#name", name);
    await this.page.fill("#year", year);
    await this.page.click("form[action='/web/teams'] button");
    let link = this.page.locator("#teams > li > a:first-child", { hasText: `${name} - ${year}` });
    await expect(link).toHaveCount(1);
    return +new URL((await link.getAttribute("href"))!, this.page.url()).searchParams.get(
      "teamId",
    )!;
  }

  async teamNames(): Promise<string[]> {
    await this.goto("/web/teams");
    return this.page.locator("#teams > li > a:first-child").allInnerTexts();
  }

  async addPlayer(teamId: number | string, name: string) {
    await this.goto(`/web/players?teamId=${teamId}`);
    await this.page.fill("#newPlayer", name);
    await this.page.press("#newPlayer", "Enter");
    await expect(this.page.locator("#playerCards input[name=name]").last()).toHaveValue(name);
  }

  async playerNames(teamId: number | string): Promise<string[]> {
    await this.goto(`/web/players?teamId=${teamId}`);
    return this.page
      .locator("#playerCards input[name=name]")
      .evaluateAll((xs) => xs.map((x) => (x as HTMLInputElement).value));
  }

  async addGame(teamId: number | string, opponent: string, date = "2026-11-01T10:00") {
    await this.goto(`/web/games?teamId=${teamId}`);
    await this.page.fill("#gameDate", date);
    await this.page.fill("#gameOpponent", opponent);
    await this.page.click("form.form >> button:has-text('Save')");
    await expect(this.page.locator("#games")).toContainText(opponent);
  }

  // Publishes (or republishes) the team's schedule; returns its page id.
  async publishSchedule(teamId: number | string): Promise<string> {
    await this.goto(`/web/games?teamId=${teamId}`);
    let published = this.page.waitForResponse((x) => x.url().includes("handler=publishSchedule"));
    await this.page.locator("#schedule-share button").click();
    expect((await published).ok()).toBe(true);
    await expect(this.page.locator("#schedule-share")).toContainText("Shared schedule:");
    return (await this.idb<{ scheduleFileId: string }>(["team", teamId]))!.scheduleFileId;
  }

  /*** Sharing ***/

  // Shares a personal team; returns the shared team id and the invite link.
  async shareTeam(teamId: number): Promise<{ space: string; invite: string }> {
    await this.goto(`/web/share?teamId=${teamId}`);
    await this.page.click("button:has-text('Share this team')");
    await this.page.waitForURL(/invite=/);
    let space = new URL(this.page.url()).searchParams.get("teamId")!;
    return { space, invite: await this.page.inputValue("#invite-link") };
  }

  async newInvite(space: string): Promise<string> {
    await this.goto(`/web/share?teamId=${space}`);
    let link = this.page.locator("#invite-link");
    let old = (await link.count()) ? await link.inputValue() : "";
    await this.page.click("#invite form button");
    await expect(link).toHaveValue(/\/web\/join\/\?code=/);
    await expect(link).not.toHaveValue(old);
    return link.inputValue();
  }

  async join(invite: string) {
    await this.goto(invite);
    await this.page.click("button:has-text('Join')");
    await expect(this.page.locator("#join")).toContainText("You joined");
  }

  async members(space: string): Promise<string[]> {
    await this.goto(`/web/share?teamId=${space}`);
    return this.page.locator("#members li > span").allInnerTexts();
  }

  /*** IndexedDB (the app's local data) ***/

  async idb<T = any>(key: unknown): Promise<T | undefined> {
    return this.page.evaluate(
      (key) =>
        new Promise<any>((resolve, reject) => {
          let open = indexedDB.open("keyval-store");
          open.onsuccess = () => {
            let req = open.result
              .transaction("keyval")
              .objectStore("keyval")
              .get(key as IDBValidKey);
            req.onsuccess = () => resolve(req.result instanceof Set ? [...req.result] : req.result);
            req.onerror = () => reject(req.error);
          };
        }),
      key,
    );
  }

  async idbKeys(): Promise<unknown[]> {
    return this.page.evaluate(
      () =>
        new Promise<unknown[]>((resolve) => {
          let open = indexedDB.open("keyval-store");
          open.onsuccess = () => {
            let req = open.result.transaction("keyval").objectStore("keyval").getAllKeys();
            req.onsuccess = () => resolve(req.result);
          };
        }),
    );
  }
}

interface Fixtures {
  // Creates a new verified user. Call `device()` again with the same email for
  // a second device of the same coach.
  newCoach: (name: string) => Promise<Coach>;
  device: (email: string) => Promise<Coach>;
}

export const test = base.extend<Fixtures>({
  device: async ({ browser }, use) => {
    let coaches: Coach[] = [];
    await use(async (email) => {
      let coach = await Coach.create(browser, email);
      coaches.push(coach);
      await coach.login();
      return coach;
    });
    await Promise.all(coaches.map((x) => x.context.close()));
  },

  newCoach: async ({ device }, use) => {
    await use(async (name) => {
      let email = `${name}-${randomUUID().slice(0, 8)}@example.com`;
      await registerVerified(email);
      return device(email);
    });
  },
});

export { expect };
