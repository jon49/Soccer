import type { RouteGetArgs } from "@jon49/sw/routes.middleware.js";
import playMatchView from "./_play-match-view.js";
import { PlayerStateView } from "./shared.js";

let {
  globalDb,
  html,
  validation: { queryTeamIdGameIdValidator, validateObject },
} = self.sw;

export async function play({
  app,
  query,
}: RouteGetArgs & { app?: Promise<AsyncGenerator<any, void, unknown>> }) {
  let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator);
  let state = new PlayerStateView(teamId, gameId);
  let { disableAutoSyncDuringGame, theme } = await globalDb.settings();
  // As in the layout: data-theme when a theme is saved (nimble maps it to
  // color-scheme); without one, nimble's `color-scheme: light dark` follows
  // the system.
  let themeAttr = theme ? ` data-theme="${theme}"` : "";
  return html`
<!DOCTYPE html>
<html lang=en$${themeAttr}>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="auto-sync-disable-during-game" content="${disableAutoSyncDuringGame ? "1" : "0"}">
    <base target=htmz>
    <title>Match - Soccer</title>
    <link rel="icon" type="image/x-icon" href="/web/images/soccer.ico">
    <link rel="apple-touch-icon" href="/web/images/soccer.png">
    <meta name="theme-color" content="#506f8d">
    <link href="/web/css/app.css" rel=stylesheet>
    <link href="/web/css/match.css" rel=stylesheet>

    <script src="/web/js/app.bundle.js" type="module"></script>
    <script src="/web/js/game-timer.js" type="module"></script>
    <script src="/web/js/match-select.js" type="module"></script>
</head>
<body>
<script>window.app = {}</script>

${app ? app : playMatchView(state)}

<div id=toasts></div>
<div id=temp></div>

<form id=post method=post hidden></form>

</body>
</html>
`;
}
