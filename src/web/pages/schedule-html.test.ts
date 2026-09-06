import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Game, Team } from "../server/db.js";
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
    assert.match(html, /<td>Away<\/td>/);
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

  it("renders a placeholder row when there are no games", () => {
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
});
