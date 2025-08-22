import { RouteGetHandler, RoutePage } from "@jon49/sw/routes.middleware.js"
import { queryTeamIdGameIdValidator } from "../../../server/validators.js"
import { validateObject } from "promise-validation"
import html from "html-template-tag-stream"
import { PlayerStateView } from "../shared.js"

const getHandlers: RouteGetHandler = {
    async get({ query }) {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        let state = new PlayerStateView(teamId, gameId)
        let team = await state.team()
        let game = await state.game()

        return html`
<!DOCTYPE html>
<html>
<head>
    <title>${`Match — ${team.name} VS ${game.opponent}`}</title>
    <style> @import url("/web/css/pico.blue.min.css") layer(base); </style>
    <style>
        .empty {
            margin: 2rem;
            border: 3px solid #ccc;
            padding: 0.5em;
            border-radius: 1em;
        }
    </style>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" type="image/x-icon" href="/web/images/soccer.ico">
    <link href="/web/css/app.css" rel=stylesheet>
</head>
<body>
    <main id=app></main>
<script src="/web/js/game-timer.js" type=module></script>
<script src="/web/js/game-shader.js" type=module></script>
<script src="/web/js/match.bundle.js" type=module></script>
</body>
</html>`
    }
}

const route : RoutePage = {
    get: getHandlers,
    // post: postHandlers,
}

export default route
