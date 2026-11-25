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

export interface ActionResult {
  failed: boolean;
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
    // Background auto-sync draws the page again whenever the server has new
    // data, which races with clicks. Tests sync explicitly with `sync()`
    // instead, unless they turn it back on with `autoSync()`
    // (src/web/app/sync.ts).
    await context.addInitScript(() => {
      (window as any).e2eAutoSyncOff = true;
    });
    let page = await context.newPage();
    page.on("dialog", (x) => x.accept());
    return new Coach(email, context, page);
  }

  offline = false;

  async goto(path: string) {
    if (
      this.offline &&
      path.startsWith("/web/") &&
      new URL(this.page.url()).pathname.startsWith("/web/")
    ) {
      // Offline, the coach moves within the app that's open, by a link (in
      // development nothing is cached to load a page from).
      await this.page.evaluate(
        (href) =>
          new Promise<void>((resolve) => {
            document.addEventListener("app:page", () => resolve(), { once: true });
            let a = document.createElement("a");
            a.href = href;
            document.body.append(a);
            a.click();
            a.remove();
          }),
        path,
      );
      return;
    }
    await this.page.goto(path);
    await this.page.waitForLoadState("networkidle");
    // The app shell draws the page (src/web/app/router.ts).
    if (path.startsWith("/web/")) await this.page.locator("#main > *").first().waitFor();
  }

  // Runs `tap`, then waits for the page's `action` (src/web/app/action.ts)
  // to finish. Returns the toasts it showed, and whether it failed.
  async tap(action: string, tap: () => Promise<void>): Promise<ActionResult> {
    let done = this.page.evaluate(
      (action) =>
        new Promise<ActionResult>((resolve) => {
          let done = (e: Event) => {
            let detail = (e as CustomEvent).detail;
            if (detail?.action !== action) return;
            document.removeEventListener("app:done", done);
            let messages = Array.from(
              document.querySelectorAll("#toasts .message"),
              (x) => x.textContent ?? "",
            );
            resolve({ failed: !!detail.failed, messages });
          };
          document.addEventListener("app:done", done);
        }),
      action,
    );
    await tap();
    return done;
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

  // Deletes the account from Settings (the confirm is accepted); returns the
  // toasts the app showed.
  async deleteAccount(): Promise<string[]> {
    await this.goto("/web/settings");
    let { messages } = await this.tap("deleteAccount", () =>
      this.page.click("#account button:has-text('Delete account')"),
    );
    return messages;
  }

  // Lets this page's background auto-sync run, until it's reloaded.
  async autoSync() {
    await this.page.evaluate(() => ((window as any).e2eAutoSyncOff = false));
  }

  // Syncs as the sync button does: the page is drawn again when the server
  // sent new data. 200 when the sync went through, with or without new data
  // (the worker says 204 for none), else the server's status.
  async sync(): Promise<SyncResult> {
    let result: SyncResult = await this.page.evaluate(() => (window as any).appSync());
    return { ...result, status: result.status === 204 ? 200 : result.status };
  }

  async goOffline(offline = true) {
    this.offline = offline;
    await this.context.setOffline(offline);
  }

  /*** Teams ***/

  async createTeam(name: string, year: string): Promise<number> {
    await this.goto("/web/teams");
    await this.page.fill("#name", name);
    await this.page.fill("#year", year);
    await this.page.click("form:has(#name) button");
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
    let published = await this.tap("publishSchedule", () =>
      this.page.locator("#schedule-share button").click(),
    );
    expect(published.failed).toBe(false);
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
