import type { RouteGetArgs } from "@jon49/sw/routes.middleware.js"
import playMatchView from "./_play-match-view.js"
import { PlayerStateView } from "./shared.js"

let {
    html,
    validation: { queryTeamIdGameIdValidator, validateObject }
} = self.app

export async function play2({ query }: RouteGetArgs) {
    let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
    let state = new PlayerStateView(teamId, gameId)
    return html`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Match - Soccer</title>
    <link rel="icon" type="image/x-icon" href="/web/images/soccer.ico">
    <style>@import url("/web/css/pico.blue.min.css") layer(base);</style>
    <link href="/web/css/app.css" rel=stylesheet>
    <style>
        .empty {
            margin: 1rem;
            border: 3px solid #ccc;
            padding: 0.5em;
            border-radius: 1em;
        }
        [traits="game-timer"] {
            width: 5em;
            text-align: center;
        }
        .in-play-button {
            padding: 0 0.75em;
            border-bottom-left-radius: unset;
        }
        .in-play-button + .in-play-button {
            border-left: 1px solid var(--pico-color);
            border-bottom-right-radius: unset;
        }
        .in-play-timer {
            width: 100%;
            text-align: center;
        }
    </style>

    <script src="/web/js/app.bundle.js" type="module"></script>
    <script src="/web/js/game-timer.js" type="module"></script>
    <script src="/web/js/game-shader.js" type="module"></script>
    <script src="/web/js/morphdom.bundle.js" type="module"></script>
</head>
<body>
${playMatchView(state)}
</body>
</html>
`
}
