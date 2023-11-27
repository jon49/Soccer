import { validateObject } from "promise-validation";
import { Game, PlayerGame, Team } from "../../server/db.js";
import { playerGameAllGet, playerGameSave, positionGetAll } from "../../server/repo-player-game.js";
import { teamGet } from "../../server/repo-team.js";
import { createIdNumber, required } from "../../server/validation.js";
import { queryTeamIdGameIdValidator } from "../../server/validators.js";
import { GameTimeCalculator, PlayerGameTimeCalculator, isInPlayPlayer, isOnDeckPlayer } from "./shared.js";

const queryTeamGamePlayerValidator = {
    ...queryTeamIdGameIdValidator,
    playerId: createIdNumber("Query Player Id")
}

export default async function targetPosition(query: any, targetPosition: number) {
        let { gameId, playerId, teamId } =
            await validateObject(query, queryTeamGamePlayerValidator)

        let [team, players] =
            await Promise.all([
                teamGet(teamId),
                playerGameAllGet(teamId, gameId, [playerId])])
        let game = await required(team.games.find(x => x.id === gameId), "Could not find game ID!")
        let player = await required(players.find(x => x.playerId === playerId), "Could not find player ID!")

        await _targetPosition(player, team, game, targetPosition)
}

async function _targetPosition(
    player: PlayerGame,
    team: Team,
    game: Game,
    targetPosition: number) {

    let [ players, { positions } ] = await Promise.all([
        playerGameAllGet(team.id, game.id, []),
        positionGetAll(team.id)
    ])

    await swapWhenInGame(player, players, positions.flat(), team, targetPosition, game)
    await swapToOnDeck(player, players, positions.flat(), team, targetPosition, game)
}

async function swapToOnDeck(
    player: PlayerGame,
    players: PlayerGame[],
    positions: string[],
    team: Team,
    targetPosition: number,
    game: Game) {

    if (!(player.status?._ === "onDeck" || player.status?._ === "out" || !player.status?._)) return

    let onDeckPlayer =
        players
        .filter(isOnDeckPlayer)
        .find(x => x.status.targetPosition === targetPosition)

    if (onDeckPlayer) {
        (<PlayerGame>onDeckPlayer).status = { _: "out" }
        await playerGameSave(team.id, onDeckPlayer)
    }

    player.status = {
        _: "onDeck",
        targetPosition,
    }

    let playerCalc = new PlayerGameTimeCalculator(player, new GameTimeCalculator(game))
    if (isOnDeckPlayer(player)) {
        playerCalc.position(positions[targetPosition])
    }

    await playerGameSave(team.id, player)
}

async function swapWhenInGame(
    player: PlayerGame,
    players: PlayerGame[],
    positions: string[],
    team: Team,
    targetPosition: number,
    game: Game) {

    if (player.status?._ !== "inPlay") return

    let inGamePlayer =
        players
        .filter(isInPlayPlayer)
        .find(x => x.status.position === targetPosition)

    if (inGamePlayer) {
        inGamePlayer.status.position = player.status.position
    }
    player.status.position = targetPosition

    let gameCalc = new GameTimeCalculator(game)
    let playerCalc = new PlayerGameTimeCalculator(player, gameCalc)
    let gameOn = playerCalc.isGameOn()

    let positionName = positions[targetPosition]
    if (gameOn) {
        playerCalc.end()
        playerCalc.position(positionName)
        playerCalc.start()
    } else {
        playerCalc.position(positionName)
    }

    if (inGamePlayer) {
        let inGamePlayerCalc = new PlayerGameTimeCalculator(inGamePlayer, gameCalc)
        let positionName = positions[player.status.position]
        if (gameOn) {
            inGamePlayerCalc.end()
            inGamePlayerCalc.position(positionName)
            inGamePlayerCalc.start()
        } else {
            inGamePlayerCalc.position(positionName)
        }
        await inGamePlayerCalc.save(team.id)
    }

    await playerCalc.save(team.id)
}

