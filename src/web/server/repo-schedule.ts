import type { Team } from "./db.js";
import { teamSave } from "./repo-team.js";
import { authFetch, OFFLINE_STATUS } from "./api-client.js";
import { renderScheduleHtml } from "../pages/schedule-html.js";

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

export async function publishTeamSchedule(team: Team): Promise<{ url: string }> {
  // Reusing the guid makes this call an overwrite (same `id`) instead of a
  // new publish, so the shareable URL never changes across republishes.
  let guid = team.scheduleFileId ?? crypto.randomUUID();
  let html = renderScheduleHtml(team);

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
