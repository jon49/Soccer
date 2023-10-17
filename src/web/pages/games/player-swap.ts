import { validateObject } from "promise-validation";
import { Game, PlayerGame, Team } from "../../server/db.js";
import { playerGameAllGet, playerGameSave, positionGetAll } from "../../server/repo-player-game.js";
import { teamGet } from "../../server/repo-team.js";
import { createIdNumber, createPositiveWholeNumber, required } from "../../server/validation.js";
import { queryTeamIdGameIdValidator } from "../../server/validators.js";
import { GameTimeCalculator, PlayerGameTimeCalculator, isInPlayPlayer, isOnDeckPlayer } from "./shared.js";

const queryTeamGamePlayerValidator = {
    ...queryTeamIdGameIdValidator,
    playerId: createIdNumber("Query Player Id")
}

export class PlayerSwap {
    #player: PlayerGame
    #team: Team
    #game: Game
    constructor(
        player: PlayerGame,
        team: Team,
        game: Game
    ) {
        this.#player = player
        this.#team = team
        this.#game = game
    }

    targetPosition(targetPosition: number) {
        return _targetPosition(this.#player, this.#team, this.#game, targetPosition)
    }

    swap() {
        return _swap(this.#player, this.#team, this.#game)
    }

    static async create(query: any) {
        let { gameId, playerId, teamId } =
            await validateObject(query, queryTeamGamePlayerValidator)

        let [team, players] =
            await Promise.all([
                teamGet(teamId),
                playerGameAllGet(teamId, gameId, [playerId])])
        let game = await required(team.games.find(x => x.id === gameId), "Could not find game ID!")
        let player = await required(players.find(x => x.playerId === playerId), "Could not find player ID!")

        return new PlayerSwap(player, team, game)
    }
}

async function swapWhenInGame(
    player: PlayerGame,
    players: PlayerGame[],
    positions: string[],
    team: Team,
    targetPosition: number) {

    if (player.status?._ !== "inPlay") return

    let inGamePlayer =
        players
        .filter(isInPlayPlayer)
        .find(x => x.status.position === targetPosition)

    if (inGamePlayer) {
        inGamePlayer.status.position = player.status.position
    }
    player.status.position = targetPosition

    let playerCalc = new PlayerGameTimeCalculator(player)
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
        let inGamePlayerCalc = new PlayerGameTimeCalculator(inGamePlayer)
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

async function swapToOnDeck(
    player: PlayerGame,
    players: PlayerGame[],
    positions: string[],
    team: Team,
    targetPosition: number) {

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

    let playerCalc = new PlayerGameTimeCalculator(player)
    if (player.status._ === "onDeck") {
        playerCalc.position(positions[targetPosition])
    }

    await playerGameSave(team.id, player)
}

async function swapWhenOnDeck(
    player: PlayerGame,
    players: PlayerGame[],
    positions: string[],
    team: Team,
    gameCalc: GameTimeCalculator
) {
    if (!isOnDeckPlayer(player)) return

    let targetPosition = player.status.targetPosition

    let inPlayPlayer =
        players.find(x => 
            isInPlayPlayer(x)
            && x.status.position === targetPosition)
    if (inPlayPlayer) {
        let inPlyaerCalc = new PlayerGameTimeCalculator(inPlayPlayer)
        if (inPlyaerCalc.isGameOn()) {
            inPlyaerCalc.end()
        }
        inPlayPlayer.status = { _: "out" }
        await inPlyaerCalc.save(team.id)
    }

    (<PlayerGame>player).status = {
        _: "inPlay",
        position: player.status.targetPosition
    }

    let playerCalc = new PlayerGameTimeCalculator(player)
    playerCalc.position(positions[targetPosition])
    if (gameCalc.isGameOn()) {
        playerCalc.start()
    }
    await playerCalc.save(team.id)
}

async function _swap(player: PlayerGame, team: Team, game: Game) {
    let [ players, { positions } ] = await Promise.all([
        playerGameAllGet(team.id, game.id, []),
        positionGetAll(team.id)
    ])
    let gameCalc = new GameTimeCalculator(game)
    await swapWhenOnDeck(player, players, positions, team, gameCalc)
}

function getPlayerPosition(player : PlayerGame) {
    if (player.status?._ === "onDeck") {
        return player.status.targetPosition
    }
    if (player.status?._ === "inPlay") {
        return player.status.position
    }
    return null
}

export async function swapAll(teamId: number, gameId: number) {
    let team = await teamGet(teamId)
    let players = await playerGameAllGet(teamId, gameId, team.players.map(x => x.id))
    let inPlayers = players.filter(isInPlayPlayer)
    let onDeckPlayers = players.filter(isOnDeckPlayer)
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

async function _targetPosition(player: PlayerGame, team: Team, game: Game, targetPosition: number) {

    let [ players, { positions } ] = await Promise.all([
        playerGameAllGet(team.id, game.id, []),
        positionGetAll(team.id)
    ])

    await swapWhenInGame(player, players, positions, team, targetPosition)
    await swapToOnDeck(player, players, positions, team, targetPosition)
}

