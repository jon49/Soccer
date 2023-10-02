import { addRoutes } from "../server/route.js"
import index from "../pages/index.html.js"
import teams from "../pages/teams.html.js"
import players from "../pages/players.html.js"
import games from "../pages/games.html.js"
import gamesPlay from "../pages/games/game-play.html.js"
import positions from "../pages/positions.html.js"
import activities from "../pages/activities.html.js"
import userSettings from "../pages/user-settings/edit.html.js"
import sync from "../api/sync.js"
import gameSwap from "../pages/games/game-play-swap.html.js"
import gamesPlay2 from "../pages/games2/game-play.html.js"

addRoutes([
    index,
    sync,
    teams,
    gameSwap,
    players,
    gamesPlay,
    gamesPlay2,
    games,
    positions,
    activities,
    userSettings
])

