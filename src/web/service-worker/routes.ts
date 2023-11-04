import { addRoutes } from "../server/route.js"
import index from "../pages/index.html.js"
import teams from "../pages/teams.html.js"
import players from "../pages/players.html.js"
import games from "../pages/games.html.js"
import gamesPlay from "../pages/games/game-play.html.js"
import positions from "../pages/positions.html.js"
import activities from "../pages/activities.html.js"
import sync from "../api/sync.js"
import settings from "../api/settings.js"

addRoutes([
    index,
    settings,
    sync,
    teams,
    players,
    gamesPlay,
    games,
    positions,
    activities,
])

