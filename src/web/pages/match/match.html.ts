import { PostHandlers, Route, RouteGetHandler } from "@jon49/sw/src/routes.js"
import layout from "../_layout.html.js"
import { queryTeamIdGameIdValidator } from "../../server/validators.js"
import { validateObject } from "promise-validation"
import { saveGameNotes, teamGet, teamSave } from "../../server/repo-team.js"
import { createIdNumber, createPositiveWholeNumber, createString25, createStringInfinity, required } from "../../server/validation.js"
import { Game } from "../../server/db.js"
import { playerGameAllGet, playerGameSave } from "../../server/repo-player-game.js"
import { GameTimeCalculator, PlayerGameTimeCalculator, PlayerStateView, isInPlayPlayer } from "./shared.js"
import render, { getPointsView } from "./_game-play-view.js"
import playerStateView from "./_player-state-view.js"
import { swapAll } from "./player-swap.js"
import targetPositionView from "./_target-position-view.js"
import targetPosition from "./player-target-position.js"
import { teamNav } from "../_shared-views.js"
import { activityPlayerSelectorView } from "./_activity-position-view.js"
import { reject } from "../../server/repo.js"

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
            return reject("Points cannot be negative!")
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

const dataSetPlayerActivity = {
    activityId: createIdNumber("Activity ID"),
    playerId: createIdNumber("Player ID"),
    operation: createString25("Action")
}

interface PlayerStatUpdatedArgs {
    activityId: number
    action: string
    playerId: number
    teamId: number
    gameId: number
}

async function handlePlayerStatUpdated(data: PlayerStatUpdatedArgs) {
    if (data.activityId === 1) {
        let action : (query: any) => Promise<any> =
            data.action === "inc"
                ? setPoints(game => ++game.points)
            : setPoints(game => --game.points)
        await action({ query: data })
    }
}

const postHandlers : PostHandlers = {
    oPointsDec: setPoints(game => --game.opponentPoints),
    oPointsInc: setPoints(game => ++game.opponentPoints),
    pointsDec: setPoints(game => --game.points),
    pointsInc: setPoints(game => ++game.points),

    async updateNote ({ query, data }) {
        let { gameId, teamId } = await validateObject(query, queryTeamIdGameIdValidator)
        let { notes } = await validateObject(data, dataNotesValidator)
        await saveGameNotes(teamId, gameId, notes)

        return { body: null, status: 204 }
    },

    async swap ({ query }) {
        // The query contains the player ID and so will only swap one player.
        await swapAll(query)

        return playerStateView(await PlayerStateView.create(query))
    },

    async swapAll ({ query }) {
        await swapAll(query)

        return playerStateView(await PlayerStateView.create(query))
    },

    async updateUserPosition({ query }) {
        let { position } = await validateObject(query, queryPositionUpdateValidator)
        await targetPosition(query, position)

        return playerStateView(await PlayerStateView.create(query))
    },

    async playerNowOut ({ query }) {
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

        return playerStateView(await PlayerStateView.create(query))
    },

    async cancelOnDeck ({ query }) {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let [player] = await playerGameAllGet(teamId, gameId, [playerId])
        player.status = { _: "out" }
        player.gameTime.pop()
        await playerGameSave(teamId, player)

        return playerStateView(await PlayerStateView.create(query))
    },

    async notPlaying ({ query }) {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let [player] = await playerGameAllGet(teamId, gameId, [playerId])
        player.status = { _: "notPlaying" }
        await playerGameSave(teamId, player)

        return playerStateView(await PlayerStateView.create(query))
    },

    async backIn ({ query }) {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let [player] = await playerGameAllGet(teamId, gameId, [playerId])
        player.status = { _: "out" }
        await playerGameSave(teamId, player)

        return playerStateView(await PlayerStateView.create(query))
    },

    async startGame ({ query }) {
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

        return render(query)
    },

    async pauseGame ({ query }) {
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

        return render(query)
    },

    async endGame({ query }) {
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

        return render(query)
    },

    async restartGame({ query }) {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        let team = await teamGet(teamId)
        let game = await required(team.games.find(x => x.id === gameId), `Could not find game! ${gameId}`)
        game.status = "paused"
        await teamSave(team)

        return render(query)
    },

    async setPlayerStat(o) {
        let { query, data } = o
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        let { activityId, playerId, operation } = await validateObject(data, dataSetPlayerActivity)
        let [player] = await playerGameAllGet(teamId, gameId, [playerId])

        let activity = player.stats.find(x => x.id === activityId)
        if (!activity) {
            activity = {
                id: activityId,
                count: 0
            }
            player.stats.push(activity)
        }

        if (operation === "inc") {
            activity.count++
        } else {
            activity.count--
        }

        await playerGameSave(teamId, player)

        await handlePlayerStatUpdated({
            activityId,
            action: operation,
            playerId,
            teamId,
            gameId
        })

        return {
            body: null,
            status: 204,
            events: {
                playerStatUpdated: {
                    statId: activityId
                }
            }
        }
    }

}

const getHandlers : RouteGetHandler = {
    async cancelSwap ({ query }) {
        return playerStateView(await PlayerStateView.create(query))
    },

    async playerSwap({ query }) {
        return targetPositionView(query)
    },

    activityPlayerSelector({ query }) {
        return activityPlayerSelectorView(query)
    },

    async points({ query }) {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        let team = await teamGet(teamId)
        let game = await required(team.games.find(x => x.id === gameId), "Could not find game!")

        return getPointsView(game.points)
    },

    async get({ query }) {
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
        let team = await teamGet(+query.teamId)
        let game = await required(team.games.find(x => x.id === +query.gameId), `Could not find game! ${query.gameId}`)
        return layout({
            head,
            main: await render(query),
            nav: teamNav(+query.teamId),
            scripts: [
                "/web/js/lib/elastic-textarea.js",
            ],
            title: `Match — ${team.name} VS ${game.opponent}`,
        })
    }
}

const route : Route = {
    route: /\/match\/$/,
    get: getHandlers,
    post: postHandlers,
}

export default route

