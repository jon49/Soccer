import { PostHandlers, Route } from "../../server/route.js"
import layout from "../_layout.html.js"
import { queryTeamIdGameIdValidator } from "../../server/validators.js"
import { validateObject } from "promise-validation"
import { saveGameNotes, teamGet, teamSave } from "../../server/repo-team.js"
import { createIdNumber, createPositiveWholeNumber, createStringInfinity, required } from "../../server/validation.js"
import { Game, PlayerGame } from "../../server/db.js"
import { playerGameAllGet, playerGameSave } from "../../server/repo-player-game.js"
import { GameTimeCalculator, PlayerGameTimeCalculator, PlayerStateView, filterInPlayPlayers, filterOnDeckPlayers } from "./shared.js"
import render, { getPointsView } from "./_game-play-view.js"
import playerStateView from "./_player-state-view.js"
import html from "html-template-tag-stream"

function getPlayerPosition(player : PlayerGame) {
    if (player.status?._ === "onDeck") {
        return player.status.targetPosition
    }
    if (player.status?._ === "inPlay") {
        return player.status.position
    }
    return null
}

async function swap({ teamId, playerIds, gameId } : { teamId : number, playerIds: number[], gameId: number, timestamp: number }) {
    let [team, players] = await Promise.all([teamGet(teamId), playerGameAllGet(teamId, gameId, playerIds)])
    let game = await required(team.games.find(x => x.id === gameId), "Could not find game ID!")
    for (let player of players) {
        let calc = new PlayerGameTimeCalculator(player)
        if (player.status?._ === "onDeck" && player.status.targetPosition != null && player.status.currentPlayerId) {
            let [currentPlayer] = await playerGameAllGet(teamId, gameId, [player.status.currentPlayerId])
            let inPlayerCalc = new PlayerGameTimeCalculator(currentPlayer)
            if (inPlayerCalc.hasStarted()) {
                inPlayerCalc.end()
            }
            currentPlayer.status = { _: "out" }
            await inPlayerCalc.save(teamId)
        }
        if (game.status === "play") {
            calc.start()
        }

        let position = await createPositiveWholeNumber("Player position number")(getPlayerPosition(player))

        player.status = {
            _: "inPlay",
            position,
        }
        await calc.save(teamId)
    }
}

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

const postHandlers : PostHandlers = {
    pointsInc: setPoints(game => ++game.points),
    pointsDec: setPoints(game => --game.points),
    oPointsDec: setPoints(game => --game.opponentPoints),
    oPointsInc: setPoints(game => ++game.opponentPoints),

    updateNote: async ({ query, data }) => {
        let { gameId, teamId } = await validateObject(query, queryTeamIdGameIdValidator)
        let { notes } = await validateObject(data, dataNotesValidator)
        await saveGameNotes(teamId, gameId, notes)
        return { body: null, status: 204 }
    },

    swap: async ({ query }) => {
        let { gameId, playerId, teamId } = await validateObject(query, queryTeamGamePlayerValidator)
        await swap({ gameId, teamId, playerIds: [playerId], timestamp: +new Date() })
    },

    swapAll: async ({ query }) => {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        let team = await teamGet(teamId)
        let players = await playerGameAllGet(teamId, gameId, team.players.map(x => x.id))
        let onDeckPlayers = players.filter(filterOnDeckPlayers)
        await swap({ gameId, teamId, playerIds: onDeckPlayers.map(x => x.playerId), timestamp: +new Date() })
    },

    playerNowOut: async ({ query, req }) => {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let [p] = await playerGameAllGet(teamId, gameId, [playerId])
        p.status = { _: "out" }
        let calc = new PlayerGameTimeCalculator(p)
        if (calc.hasStarted()) {
            calc.end()
        } else {
            calc.pop()
        }
        await calc.save(teamId)

        return playerStateView(await PlayerStateView.create(req))
    },

    cancelOnDeck: async ({ query, req }) => {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let [player] = await playerGameAllGet(teamId, gameId, [playerId])
        player.status = { _: "out" }
        player.gameTime.pop()
        await playerGameSave(teamId, player)

        return playerStateView(await PlayerStateView.create(req))
    },

    notPlaying: async ({ query, req }) => {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let [player] = await playerGameAllGet(teamId, gameId, [playerId])
        player.status = { _: "notPlaying" }
        await playerGameSave(teamId, player)

        return playerStateView(await PlayerStateView.create(req))
    },

    backIn: async ({ query, req }) => {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let [player] = await playerGameAllGet(teamId, gameId, [playerId])
        player.status = { _: "out" }
        await playerGameSave(teamId, player)

        return playerStateView(await PlayerStateView.create(req))
    },

    startGame: async ({ query, req }) => {
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
        let inPlayPlayers = players.filter(filterInPlayPlayers)
        await Promise.all(inPlayPlayers.map(player => {
            let calc = new PlayerGameTimeCalculator(player)
            calc.start()
            return calc.save(teamId)
        }))

        return render(req)
    },

    pauseGame: async ({ query, req }) => {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        let team = await teamGet(teamId)

        let game = await required(team.games.find(x => x.id === gameId), `Could not find game! ${gameId}`)
        game.status = "paused"
        let gameCalc = new GameTimeCalculator(game)
        gameCalc.end()
        await teamSave(team)

        let players = await playerGameAllGet(teamId, gameId, team.players.map(x => x.id))
        let inPlayPlayers = players.filter(filterInPlayPlayers)
        await Promise.all(inPlayPlayers.map(player => {
            let calc = new PlayerGameTimeCalculator(player)
            let currentPosition = calc.currentPosition()
            calc.end()
            calc.position(currentPosition)
            return calc.save(teamId)
        }).filter(x => x))

        return render(req)
    },

    endGame: async ({ query, req }) => {
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
            .filter(filterInPlayPlayers)
            .map(player => {
                let calc = new PlayerGameTimeCalculator(player)
                calc.end()
                // @ts-ignore
                player.status = { _: "out"}
                return calc.save(teamId)
            }))

        return render(req)
    },

    restartGame: async ({ query }) => {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        let team = await teamGet(teamId)
        let game = await required(team.games.find(x => x.id === gameId), `Could not find game! ${gameId}`)
        game.status = "paused"
        await teamSave(team)
    },

}

const route : Route = {
    route: (url: URL) =>
        url.pathname.endsWith("/games/")
        && ["gameId", "teamId"].every(x => url.searchParams.has(x)),
    async get(req: Request) {
        let head = `
            <style>
                .auto-select {
                    width: 2em;
                    appearance: none;
                }
                .auto-select:focus {
                    width: auto;
                    appearance: auto;
                }
                ul.list {
                    border-collapse: collapse;
                }
                .round > *:first-child {
                    border-radius: var(--rc) 0 0 var(--rc);
                }
                .round > *:last-child {
                    border-radius: 0 var(--rc) var(--rc) 0;
                }
            </style>
            <script src="/web/js/game-timer.js"></script>
            <script src="/web/js/game-shader.js"></script>`
        return layout(req, {
            head,
            bodyAttr: `mpa-persist mpa-page-name="game-play"`,
            main: await render(req),
            scripts: ["/web/js/lib/elastic-textarea.js"],
            title: "Game Play",
            useHtmf: true,
        })
    },
    post: postHandlers,
}

export default route

