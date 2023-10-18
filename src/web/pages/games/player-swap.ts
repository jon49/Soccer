import { validateObject } from "promise-validation";
import { PlayerGame } from "../../server/db.js";
import { playerGameAllGet } from "../../server/repo-player-game.js";
import { teamGet } from "../../server/repo-team.js";
import { createIdNumber, createPositiveWholeNumber, maybe, required } from "../../server/validation.js";
import { queryTeamIdGameIdValidator } from "../../server/validators.js";
import { GameTimeCalculator, PlayerGameTimeCalculator, isInPlayPlayer, isOnDeckPlayer } from "./shared.js";

const queryTeamGamePlayerValidator = {
    ...queryTeamIdGameIdValidator,
    playerId: maybe(createIdNumber("Query Player Id"))
}

function getPlayerPosition(player : PlayerGame) {
    return isOnDeckPlayer(player)
        ? player.status.targetPosition
    : isInPlayPlayer(player)
        ? player.status.position
    : null
}

export async function swapAll(query: any) {
    let { gameId, playerId, teamId } =
        await validateObject(query, queryTeamGamePlayerValidator)

    let team = await teamGet(teamId)
    let players = await playerGameAllGet(teamId, gameId, team.players.map(x => x.id))
    let inPlayers = players.filter(isInPlayPlayer)
    let onDeckPlayers =
        players
        .filter(isOnDeckPlayer)
        .filter(x => playerId ? x.playerId === playerId : true)
    let game = await required(team.games.find(x => x.id === gameId), "Could not find game ID!")
    let gameCalc = new GameTimeCalculator(game)
    for (let player of onDeckPlayers) {
        let calc = new PlayerGameTimeCalculator(player)

        let currentPlayer =
            inPlayers.find(x => x.status.position === player.status.targetPosition)
        if (currentPlayer) {
            let inPlayerCalc = new PlayerGameTimeCalculator(<PlayerGame>currentPlayer)
            if (inPlayerCalc.hasStarted()) {
                inPlayerCalc.end()
            }
            (<PlayerGame>currentPlayer).status = { _: "out" }
            await inPlayerCalc.save(teamId)
        }

        if (gameCalc.isGameOn()) {
            calc.start()
        }

        let position = await createPositiveWholeNumber("Player position number")(getPlayerPosition(player))

        ;(<PlayerGame>player).status = {
            _: "inPlay",
            position,
        }
        await calc.save(teamId)
    }
}

