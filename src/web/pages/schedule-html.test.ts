import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Game, GameState, Team, TeamPlayer } from "../server/db.js";
import { renderScheduleHtml } from "./schedule-html.js";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 1,
    date: "2026-04-01",
    home: true,
    ...overrides,
  };
}

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 1,
    name: "Sharks",
    year: "2026",
    active: true,
    players: [],
    games: [],
    positions: [],
    _rev: 0,
    _v: 0,
    ...overrides,
  };
}

function makePlayer(id: number, name: string): TeamPlayer {
  return { id, name, active: true };
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 1,
    points: 0,
    opponentPoints: 0,
    gameTime: [],
    _rev: 0,
    ...overrides,
  };
}

describe("renderScheduleHtml", () => {
  it("headers with the team name and year", () => {
    let html = renderScheduleHtml(makeTeam({ name: "Sharks", year: "2026" }));
    assert.match(html, /<title>Sharks 2026<\/title>/);
    assert.match(html, /<h1>Sharks 2026<\/h1>/);
  });

  it("lists each game's date, time, opponent, home/away, and location", () => {
    let html = renderScheduleHtml(
      makeTeam({
        games: [
          makeGame({
            date: "2026-04-01",
            time: "09:30",
            opponent: "Eagles",
            location: "Field 3",
            home: true,
          }),
        ],
      }),
    );
    assert.match(html, /Eagles/);
    assert.match(html, /Field 3/);
    assert.match(html, /9:30/);
    assert.match(html, /Home/);
  });

  it("shows Away for non-home games", () => {
    let html = renderScheduleHtml(makeTeam({ games: [makeGame({ home: false })] }));
    assert.match(html, /badge-away">Away<\/span>/);
  });

  it("falls back to TBD when time/opponent/location are missing", () => {
    let html = renderScheduleHtml(makeTeam({ games: [makeGame({ date: "2026-04-01" })] }));
    let tbdCount = (html.match(/TBD/g) || []).length;
    assert.equal(tbdCount, 3);
  });

  it("sorts games by date then time ascending", () => {
    let html = renderScheduleHtml(
      makeTeam({
        games: [
          makeGame({ id: 1, date: "2026-04-08", opponent: "Later" }),
          makeGame({ id: 2, date: "2026-04-01", opponent: "Earlier" }),
        ],
      }),
    );
    assert.ok(html.indexOf("Earlier") < html.indexOf("Later"));
  });

  it("renders a placeholder item when there are no games", () => {
    let html = renderScheduleHtml(makeTeam({ games: [] }));
    assert.match(html, /No games scheduled yet\./);
  });

  it("escapes HTML in team name and game fields", () => {
    let html = renderScheduleHtml(
      makeTeam({
        name: "<script>Sharks</script>",
        games: [makeGame({ opponent: "<b>Eagles</b>" })],
      }),
    );
    assert.doesNotMatch(html, /<script>Sharks<\/script>/);
    assert.doesNotMatch(html, /<b>Eagles<\/b>/);
    assert.match(html, /&lt;script&gt;/);
  });

  it("tags each game card with its date for client-side highlighting", () => {
    let html = renderScheduleHtml(makeTeam({ games: [makeGame({ id: 1, date: "2026-04-01" })] }));
    assert.match(html, /<li class="game" data-date="2026-04-01">/);
  });

  it("defines current-game and alternating-row highlight styles", () => {
    let html = renderScheduleHtml(makeTeam());
    assert.match(html, /li\.game\.current-game/);
    assert.match(html, /li\.game\.row-alt/);
  });

  it("includes a script that picks the current game and stripes the rest client-side", () => {
    let html = renderScheduleHtml(makeTeam());
    assert.match(html, /<script>/);
    assert.match(html, /querySelectorAll\("li\.game\[data-date\]"\)/);
    assert.match(html, /classList\.add\("current-game"\)/);
    assert.match(html, /classList\.add\("row-alt"\)/);
  });

  it("defines a dark theme that follows the OS setting and an explicit override", () => {
    let html = renderScheduleHtml(makeTeam());
    assert.match(html, /@media \(prefers-color-scheme: dark\)/);
    assert.match(html, /:root:not\(\[data-theme="light"\]\)/);
    assert.match(html, /:root\[data-theme="dark"\]/);
  });

  it("includes a theme toggle button wired to persist the viewer's choice", () => {
    let html = renderScheduleHtml(makeTeam());
    assert.match(html, /<button id="theme-toggle"/);
    assert.match(html, /localStorage\.setItem\("theme", next\)/);
    assert.match(html, /localStorage\.getItem\("theme"\)/);
  });

  it("shows the final score for ended games", () => {
    let html = renderScheduleHtml(makeTeam({ games: [makeGame({ id: 1 })] }), [
      makeGameState({ gameId: 1, status: "ended", points: 3, opponentPoints: 1 }),
    ]);
    assert.match(html, /<div class="game-score">Final: 3 – 1<\/div>/);
  });

  it("omits the score for games that haven't ended", () => {
    let html = renderScheduleHtml(
      makeTeam({ games: [makeGame({ id: 1 }), makeGame({ id: 2 }), makeGame({ id: 3 })] }),
      [
        makeGameState({ gameId: 1, status: "play", points: 2 }),
        makeGameState({ gameId: 2, status: "paused", points: 2 }),
        makeGameState({ gameId: 3 }),
      ],
    );
    assert.doesNotMatch(html, /class="game-score"/);
  });

  it("makes the final score open a popover listing who scored", () => {
    let html = renderScheduleHtml(
      makeTeam({
        name: "Sharks",
        players: [makePlayer(1, "Ann"), makePlayer(2, "Bo"), makePlayer(3, "Cy")],
        games: [makeGame({ id: 7 })],
      }),
      [makeGameState({ gameId: 7, status: "ended", points: 3, opponentPoints: 1 })],
      [
        { gameId: 7, playerId: 1, points: 1 },
        { gameId: 7, playerId: 2, points: 2 },
        { gameId: 7, playerId: 3, points: 0 },
      ],
    );
    assert.match(
      html,
      /<button type="button" class="score-button" popovertarget="scorers-7">Final: 3 – 1<\/button>/,
    );
    assert.match(html, /<div class="scorers" id="scorers-7" popover>/);
    assert.match(html, /Sharks scorers/);
    assert.ok(html.indexOf("<span>Bo<") < html.indexOf("<span>Ann<"), "most points first");
    assert.match(html, /<span>Bo<\/span><span>2 goals<\/span>/);
    assert.match(html, /<span>Ann<\/span><span>1 goal<\/span>/);
    assert.doesNotMatch(html, /Cy/);
    assert.doesNotMatch(html, /class="scorer-other"/);
  });

  it("lists uncredited points as Other and uses points in basketball mode", () => {
    let html = renderScheduleHtml(
      makeTeam({
        basketballMode: true,
        players: [makePlayer(1, "Ann")],
        games: [makeGame({ id: 1 })],
      }),
      [makeGameState({ gameId: 1, status: "ended", points: 5 })],
      [{ gameId: 1, playerId: 1, points: 3 }],
    );
    assert.match(html, /<span>Ann<\/span><span>3 points<\/span>/);
    assert.match(html, /class="scorer-other"><span>Other<\/span><span>2 points<\/span>/);
  });

  it("keeps the score plain when no player was credited", () => {
    let html = renderScheduleHtml(
      makeTeam({ players: [makePlayer(1, "Ann")], games: [makeGame({ id: 1 })] }),
      [makeGameState({ gameId: 1, status: "ended", points: 2 })],
    );
    assert.match(html, /<div class="game-score">Final: 2 – 0<\/div>/);
    assert.doesNotMatch(html, /popovertarget/);
  });

  it("escapes player names in the popover", () => {
    let html = renderScheduleHtml(
      makeTeam({ players: [makePlayer(1, "<i>Ann</i>")], games: [makeGame({ id: 1 })] }),
      [makeGameState({ gameId: 1, status: "ended", points: 1 })],
      [{ gameId: 1, playerId: 1, points: 1 }],
    );
    assert.doesNotMatch(html, /<i>Ann<\/i>/);
    assert.match(html, /&lt;i&gt;Ann/);
  });
});
