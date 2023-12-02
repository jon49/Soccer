import { addRoutes } from "../server/route.js"
import index from "../pages/index.html.js"
import teams from "../pages/teams.html.js"
import players from "../pages/players.html.js"
import games from "../pages/games.html.js"
import match from "../pages/match/match.html.js"
import positions from "../pages/positions.html.js"
import activities from "../pages/stats/edit/stats-edit.html.js"
import sync from "../api/sync.js"
import settings from "../api/settings.js"
import stats from "../pages/stats/stats.html.js"

addRoutes([
    index,
    settings,
    stats,
    sync,
    teams,
    players,
    match,
    games,
    positions,
    activities,
])

