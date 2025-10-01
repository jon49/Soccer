import type { RoutePostHandler, RoutePage, RouteGetHandler } from "@jon49/sw/routes.middleware.js"
import type { Game } from "../../server/db.js"
import { GameTimeCalculator, PlayerGameTimeCalculator, PlayerStateView, isInPlayPlayer } from "./shared.js"
import render, { getPointsView } from "./_game-play-view.js"
import { swapAll } from "./player-swap.js"
import targetPositionView from "./_target-position-view.js"
import targetPosition from "./player-target-position.js"
import { activityPlayerSelectorView } from "./_activity-position-view.js"
import playMatchView from "./_play-match-view.js"
import { play } from "./_play.js"

const {
    db,
    html,
    layout,
    repo: {
        playerGameAllGet,
        playerGameSave,
        saveGameNotes,
        statIds,
        teamGet,
        teamSave,
    },
    views: { teamNav },
    validation: {
        queryTeamIdGameIdValidator,
        validateObject,
        reject,
        createIdNumber,
        createPositiveWholeNumber,
        createString25,
        createStringInfinity,
        maybe,
        required,
        },
} = self.app

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

async function inPlayerOut(state: PlayerStateView, playerId: number) {
    let [
        player,
        game,
    ] = await Promise.all([
        state.playerGame(playerId),
        state.game(),
    ])
    let gameCalc = new GameTimeCalculator(game)
    player.status = { _: "out" }
    let calc = new PlayerGameTimeCalculator(player, gameCalc)
    calc.playerOut()
    await calc.save(state.teamId)
}

async function onDeckPlayerOut(state: PlayerStateView, playerId: number) {
    let player = await state.playerGame(playerId)
    player.status = { _: "out" }
    player.gameTime.pop()
    await playerGameSave(state.teamId, player)
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
    operation: createString25("Action"),
    returnUrl: maybe(createStringInfinity("Return URL"))
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

const getHandlers : RouteGetHandler = {
    async cancelSwap ({ query }) {
        return getApp(new PlayerStateView(query.teamId, query.gameId))
    },

    async playerSwap({ query }) {
        return targetPositionView(query)
    },

    async rapidFire({ query }) {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        let state = new PlayerStateView(teamId, gameId)
        let onDeckPlayers = await state.onDeckPlayers()

        let firstPlayer = onDeckPlayers.find(x => x.status.targetPosition == null)
        if (firstPlayer) {
            await db.set("rapidFire", true, false)
            return targetPositionView({ teamId, gameId, playerId: firstPlayer.playerId })
        }

        await db.set("rapidFire", false, false)
        return playMatchView(state)
    },

    async activityPlayerSelector(o) {
        let { req, query } = o
        let url = new URL(req.referrer)
        if (url.searchParams.get("handler") === "play") {
            return {
                body: await activityPlayerSelectorView(query),
                headers: {
                    "hf-target": "#app",
                },
            }
        } else if (req.headers.has("hf-request")) {
            return { status: 204 }
        }
        return play({ ...o, app: await activityPlayerSelectorView(query) })
    },

    async showInPlay({ query }) {
        return getApp(new PlayerStateView(query.teamId, query.gameId))
    },

    async points({ query }) {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        let team = await teamGet(teamId)
        let game = await required(team.games.find(x => x.id === gameId), "Could not find game!")

        return getPointsView(game.points)
    },

    play: play,

    async get({ query }) {
        let team = await teamGet(+query.teamId)
        let game = await required(team.games.find(x => x.id === +query.gameId), `Could not find game! ${query.gameId}`)
        return layout({
            main: await render(query),
            nav: teamNav(+query.teamId),
            scripts: [
                "/web/js/game-timer.js",
            ],
            title: `Match — ${team.name} VS ${game.opponent}`,
        })
    }
}

function getApp(state: PlayerStateView) {
    return html`<div id=app>${playMatchView(state)}</div>`
}

const queryActionValidatory = {
    ...queryTeamIdGameIdValidator,
    action: createString25("Action")
}

const postHandlers : RoutePostHandler = {
    oPointsDec: setPoints(game => --game.opponentPoints),
    oPointsInc: setPoints(game => ++game.opponentPoints),
    pointsDec: setPoints(game => --game.points),
    pointsInc: setPoints(game => ++game.points),

    async points(o) {
        let { query, req } = o
        let { action, teamId, gameId } = await validateObject(query, queryActionValidatory)
        let state = new PlayerStateView(teamId, gameId)
        let { stats } = await state.stats()

        if (stats.find(x => x.id === statIds.Goal)?.active) {
            return {
                status: 302,
                headers: {
                    Location: `?${state.queryTeamGame}&activityId=1&action=${action}&handler=activityPlayerSelector&returnUrl=${encodeURIComponent(req.referrer)}`
                }
            }
        }

        if (action === "inc") {
            return postHandlers.pointsInc(o)
        } else if (action === "dec") {
            return postHandlers.pointsDec(o)
        }
    },

    async updateNote ({ query, data }) {
        let { gameId, teamId } = await validateObject(query, queryTeamIdGameIdValidator)
        let { notes } = await validateObject(data, dataNotesValidator)
        await saveGameNotes(teamId, gameId, notes)

        return { body: null, status: 204 }
    },

    async swap({ query }) {
        let o = await validateObject(query, queryTeamGamePlayerValidator)
        // The query contains the player ID and so will only swap one player.
        await swapAll(query)

        return getApp(new PlayerStateView(o.teamId, o.gameId))
    },

    async swapAll({ query }) {
        let o = await validateObject(query, queryTeamIdGameIdValidator)
        await swapAll(query)
        return getApp(new PlayerStateView(o.teamId, o.gameId))
    },

    async allOut({ query }) {
        let o = await validateObject(query, queryTeamIdGameIdValidator)
        let state = new PlayerStateView(o.teamId, o.gameId)
        let [
            inPlayPlayers,
            onDeckPlayers,
        ] = await Promise.all([
            state.inPlayPlayers(),
            state.onDeckPlayers(),
        ])

        await Promise.all([
            ...inPlayPlayers.map(player => inPlayerOut(state, player.playerId)),
            ...onDeckPlayers
            .filter(x => x.status.targetPosition != null)
            .map(player => onDeckPlayerOut(state, player.playerId)),
        ])

        return getApp(new PlayerStateView(o.teamId, o.gameId))
    },

    async updateUserPosition({ query }) {
        let o = await validateObject(query, queryPositionUpdateValidator)
        await targetPosition(query, o.position)

        let rapidFire = await db.get("rapidFire")

        if (rapidFire) {
            // @ts-expect-error
            return getHandlers.rapidFire({ query })
        }

        return playMatchView(new PlayerStateView(o.teamId, o.gameId))
    },

    async playerOnDeck({ query }) {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let state = new PlayerStateView(teamId, gameId)
        let player = await state.playerGame(playerId)
        player.status = { _: "onDeck", targetPosition: null }
        await playerGameSave(teamId, player)

        return getApp(new PlayerStateView(teamId, gameId))
    },

    async playerNowOut({ query }) {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let state = new PlayerStateView(teamId, gameId)

        await inPlayerOut(state, playerId)

        return getApp(new PlayerStateView(teamId, gameId))
    },

    async cancelOnDeck({ query }) {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let state = new PlayerStateView(teamId, gameId)
        await onDeckPlayerOut(state, playerId)

        return getApp(new PlayerStateView(teamId, gameId))
    },

    async notPlaying({ query }) {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let [player] = await playerGameAllGet(teamId, gameId, [playerId])
        player.status = { _: "notPlaying" }
        await playerGameSave(teamId, player)

        return getApp(new PlayerStateView(teamId, gameId))
    },

    async backIn({ query }) {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let [player] = await playerGameAllGet(teamId, gameId, [playerId])
        player.status = { _: "out" }
        await playerGameSave(teamId, player)

        return getApp(new PlayerStateView(teamId, gameId))
    },

    async startGame({ query }) {
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

        return getApp(new PlayerStateView(teamId, gameId))
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

        return getApp(new PlayerStateView(teamId, gameId))
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

        return getApp(new PlayerStateView(teamId, gameId))
    },

    async restartGame({ query }) {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        let team = await teamGet(teamId)
        let game = await required(team.games.find(x => x.id === gameId), `Could not find game! ${gameId}`)
        game.status = "paused"
        await teamSave(team)

        return getApp(new PlayerStateView(teamId, gameId))
    },

    async setPlayerStat({ query, data }) {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        let { activityId, playerId, operation, returnUrl } = await validateObject(data, dataSetPlayerActivity)
        let [player] = await playerGameAllGet(teamId, gameId, [playerId])

        let activity = player.stats.find(x => x.statId === activityId)
        if (!activity) {
            activity = {
                statId: activityId,
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

        if (returnUrl?.includes("handler=play")) {
            return playMatchView(new PlayerStateView(teamId, gameId))
        }

        return {
            status: 302,
            headers: {
                Location: returnUrl
            }
        }
    }

}

const route : RoutePage = {
    get: getHandlers,
    post: postHandlers,
}

export default route

