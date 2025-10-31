import type { RouteGetArgs } from "@jon49/sw/routes.middleware.js"
import playMatchView from "./_play-match-view.js"
import { PlayerStateView } from "./shared.js"

let {
    globalDb: db,
    html,
    utils: { when },
    validation: { queryTeamIdGameIdValidator, validateObject }
} = self.sw

export async function play({ app, query }: RouteGetArgs & { app?: Promise<AsyncGenerator<any, void, unknown>> }) {
    let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
    let state = new PlayerStateView(teamId, gameId)
    let { theme } = await db.settings()
    return html`
<!DOCTYPE html>
<html $${when(theme, x => x == null ? null : `data-theme=${x}`)}>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <base target=htmz>
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
            border-radius: 0 0 5px 5px;
        }
        
        /* Game Shader CSS */
        :root {
            --game-shader-background: #000;
            --game-shader-color: #fff;
        }
        .game-shader {
            background: var(--game-shader-background);
            color: var(--game-shader-color);
        }
        .game-shader a {
            color: var(--game-shader-color);
        }
    </style>

    <script src="/web/js/app.bundle.js" type="module"></script>
    <script src="/web/js/game-timer.js" type="module"></script>
</head>
<body>
<script>window.app = {}</script>

${app ? app :  playMatchView(state)}

<div id=temp></div>

<form id=post method=post hidden></form>

</body>
</html>
`
}
