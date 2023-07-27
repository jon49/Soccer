import { addRoutes } from "../server/route.js"
import index from "../pages/index.html.js"
import teams from "../pages/teams.html.js"
import players from "../pages/players.html.js"
import games from "../pages/games.html.js"
import gamesPlay from "../pages/games/game-play.html.js"
import playersEdit from "../pages/players/edit.html.js"
import positions from "../pages/positions.html.js"
import activities from "../pages/activities.html.js"
import userSettings from "../pages/user-settings/edit.html.js"

addRoutes([
    index,
    teams,
    players,
    games,
    gamesPlay,
    playersEdit,
    positions,
    activities,
    userSettings
])

