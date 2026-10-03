import type { GameState, Team } from "./db.js";
import { gameStatesGet, teamSave } from "./repo-team.js";
import { playerGameAllGet, statIds } from "./repo-player-game.js";
import { authFetch, OFFLINE_STATUS } from "./api-client.js";
import { renderScheduleHtml, type GameGoals } from "../pages/schedule-html.js";

// Per ../ImageBase/README.md "Publishing HTML pages": a stable per-frontend
// app id, an owner-authenticated Record API write, and a public read route
// that serves the file inline as text/html.
const SCHEDULE_APP = "soccer";
const PUBLISH_URL = "/api/records/v1/pages";
const readUrl = (guid: string) => `/api/pages/${SCHEDULE_APP}/${guid}`;

function base64Encode(text: string): string {
  let bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Only ended games with a score show who scored, matching what the published
// page displays.
async function goalsGet(team: Team, gameStates: GameState[]): Promise<GameGoals[]> {
  let playerIds = team.players.map((x) => x.id);
  if (!playerIds.length) return [];
  let scoredGames = gameStates.filter((x) => x.status === "ended" && x.points > 0);
  let playerGames = await Promise.all(
    scoredGames.map((x) => playerGameAllGet(team.id, x.gameId, playerIds)),
  );
  return playerGames.flat().map((x) => ({
    gameId: x.gameId,
    playerId: x.playerId,
    points: x.stats.find((s) => s.statId === statIds.Goal)?.count ?? 0,
  }));
}

export async function publishTeamSchedule(team: Team): Promise<{ url: string }> {
  // Reusing the guid makes this call an overwrite (same `id`) instead of a
  // new publish, so the shareable URL never changes across republishes.
  let guid = team.scheduleFileId ?? crypto.randomUUID();
  let gameStates = await gameStatesGet(team.id, team.games);
  let html = renderScheduleHtml(team, gameStates, await goalsGet(team, gameStates));

  let res = await authFetch(PUBLISH_URL, {
    method: "POST",
    body: JSON.stringify({
      id: guid,
      app: SCHEDULE_APP,
      html: {
        filename: "schedule.html",
        content_type: "text/html",
        data: base64Encode(html),
      },
    }),
    headers: { "Content-Type": "application/json" },
  });

  if (res.status === OFFLINE_STATUS) {
    throw new Error(
      "Could not publish the schedule — you appear to be offline. Try again once you're connected.",
    );
  }
  if (!res.ok) {
    throw new Error(`Failed to publish schedule (status ${res.status}).`);
  }

  if (team.scheduleFileId !== guid) {
    team.scheduleFileId = guid;
    await teamSave(team);
  }

  return { url: getScheduleUrl(guid) };
}

export function getScheduleUrl(guid: string): string {
  return `${self.location.origin}${readUrl(guid)}?t=${Date.now()}`;
}
