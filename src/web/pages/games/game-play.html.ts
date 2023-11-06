import { PostHandlers, Route } from "../../server/route.js"
import layout from "../_layout.html.js"
import { queryTeamIdGameIdValidator } from "../../server/validators.js"
import { validateObject } from "promise-validation"
import { saveGameNotes, teamGet, teamSave } from "../../server/repo-team.js"
import { createIdNumber, createPositiveWholeNumber, createStringInfinity, required } from "../../server/validation.js"
import { Game } from "../../server/db.js"
import { playerGameAllGet, playerGameSave } from "../../server/repo-player-game.js"
import { GameTimeCalculator, PlayerGameTimeCalculator, PlayerStateView, isInPlayPlayer } from "./shared.js"
import render, { getPointsView } from "./_game-play-view.js"
import playerStateView from "./_player-state-view.js"
import { swapAll } from "./player-swap.js"
import targetPositionView from "./_target-position-view.js"
import targetPosition from "./player-target-position.js"

const queryTeamGamePlayerValidator = {
    ...queryTeamIdGameIdValidator,
    playerId: createIdNumber("Query Player Id")
}

function setPoints(f: (game: Game) => number) {
    return async ({ query } : { query: any }) => {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        let team = await teamGet(teamId)
        let game = await required(team.games.find(x => x.id === gameId), "Could not find game!")
        let points = f(game)
        if (points >= 0) {
            await teamSave(team)
        } else {
            points = 0
        }
        return getPointsView(points)
    }
}

const dataNotesValidator = {
    notes: createStringInfinity("Notes")
}

const queryPositionUpdateValidator = {
    ...queryTeamIdGameIdValidator,
    playerId: createIdNumber("Player ID"),
    position: createPositiveWholeNumber("Position"),
}

const postHandlers : PostHandlers = {
    pointsInc: setPoints(game => ++game.points),
    pointsDec: setPoints(game => --game.points),
    oPointsDec: setPoints(game => --game.opponentPoints),
    oPointsInc: setPoints(game => ++game.opponentPoints),

    async updateNote ({ query, data }) {
        let { gameId, teamId } = await validateObject(query, queryTeamIdGameIdValidator)
        let { notes } = await validateObject(data, dataNotesValidator)
        await saveGameNotes(teamId, gameId, notes)

        return { body: null, status: 204 }
    },

    async swap ({ query, req }) {
        // The query contains the player ID and so will only swap one player.
        await swapAll(query)

        return playerStateView(await PlayerStateView.create(req))
    },

    async swapAll ({ query, req }) {
        await swapAll(query)

        return playerStateView(await PlayerStateView.create(req))
    },

    async updateUserPosition({ query, req }) {
        let { position } = await validateObject(query, queryPositionUpdateValidator)
        await targetPosition(query, position)

        return playerStateView(await PlayerStateView.create(req))
    },

    async playerNowOut ({ query, req }) {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let [[p], team] = await Promise.all([
            playerGameAllGet(teamId, gameId, [playerId]),
            teamGet(teamId)
        ]) 
        let game = await required(team.games.find(x => x.id === gameId), "Could not find game!")
        let gameCalc = new GameTimeCalculator(game)
        p.status = { _: "out" }
        let calc = new PlayerGameTimeCalculator(p, gameCalc)
        calc.playerOut()
        await calc.save(teamId)

        return playerStateView(await PlayerStateView.create(req))
    },

    async cancelOnDeck ({ query, req }) {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let [player] = await playerGameAllGet(teamId, gameId, [playerId])
        player.status = { _: "out" }
        player.gameTime.pop()
        await playerGameSave(teamId, player)

        return playerStateView(await PlayerStateView.create(req))
    },

    async notPlaying ({ query, req }) {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let [player] = await playerGameAllGet(teamId, gameId, [playerId])
        player.status = { _: "notPlaying" }
        await playerGameSave(teamId, player)

        return playerStateView(await PlayerStateView.create(req))
    },

    async backIn ({ query, req }) {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let [player] = await playerGameAllGet(teamId, gameId, [playerId])
        player.status = { _: "out" }
        await playerGameSave(teamId, player)

        return playerStateView(await PlayerStateView.create(req))
    },

    async startGame ({ query, req }) {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        let timestamp = +new Date()
        let team = await teamGet(teamId)

        let game = await required(team.games.find(x => x.id === gameId), `Could not find game! ${gameId}`)
        game.status = "play"
        game.gameTime.push({
            start: timestamp
        })
        await teamSave(team)

        let players = await playerGameAllGet(teamId, gameId, team.players.map(x => x.id))
        let inPlayPlayers = players.filter(isInPlayPlayer)
        await Promise.all(inPlayPlayers.map(player => {
            let calc = new PlayerGameTimeCalculator(player, new GameTimeCalculator(game))
            calc.start()
            return calc.save(teamId)
        }))

        return render(req)
    },

    async pauseGame ({ query, req }) {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        let team = await teamGet(teamId)

        let game = await required(team.games.find(x => x.id === gameId), `Could not find game! ${gameId}`)
        game.status = "paused"
        let gameCalc = new GameTimeCalculator(game)
        gameCalc.end()
        await teamSave(team)

        let players = await playerGameAllGet(teamId, gameId, team.players.map(x => x.id))
        let inPlayPlayers = players.filter(isInPlayPlayer)
        await Promise.all(inPlayPlayers.map(player => {
            let calc = new PlayerGameTimeCalculator(player, gameCalc)
            let currentPosition = calc.currentPosition()
            calc.end()
            calc.position(currentPosition)
            return calc.save(teamId)
        }).filter(x => x))

        return render(req)
    },

    async endGame ({ query, req }) {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        let team = await teamGet(teamId)

        let game = await required(team.games.find(x => x.id === gameId), `Could not find game! ${gameId}`)
        game.status = "ended"
        let calc = new GameTimeCalculator(game)
        calc.end()
        await teamSave(team)

        let players = await playerGameAllGet(teamId, gameId, team.players.map(x => x.id))
        await Promise.all(
            players
            .filter(isInPlayPlayer)
            .map(player => {
                let playerCalc = new PlayerGameTimeCalculator(player, calc)
                playerCalc.end()
                // @ts-ignore
                player.status = { _: "out"}
                return playerCalc.save(teamId)
            }))

        return render(req)
    },

    async restartGame ({ query, req }) {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        let team = await teamGet(teamId)
        let game = await required(team.games.find(x => x.id === gameId), `Could not find game! ${gameId}`)
        game.status = "paused"
        await teamSave(team)

        return render(req)
    },

}

const route : Route = {
    route: (url: URL) =>
        url.pathname.endsWith("/games/")
        && ["gameId", "teamId"].every(x => url.searchParams.has(x)),
    async get(req: Request) {
        if (req.headers.has("HF-Request")) {
            let url = new URL(req.url)
            if (url.searchParams.get("handler") === "cancelSwap") {
                return playerStateView(await PlayerStateView.create(req))
            }
            return targetPositionView(req)
        }
        let head = `
            <style>
                .flex {
                    display: flex;
                    gap: 1rem;
                }
                .flex > * {
                    margin: auto;
                }
                .empty {
                    margin: 2rem;
                    border: 3px solid #ccc;
                }
            </style>
            <script src="/web/js/game-timer.js"></script>
            <script src="/web/js/game-shader.js"></script>`
        return layout(req, {
            head,
            main: await render(req),
            scripts: ["/web/js/lib/elastic-textarea.js"],
            title: "Game Play",
        })
    },
    post: postHandlers,
}

export default route

