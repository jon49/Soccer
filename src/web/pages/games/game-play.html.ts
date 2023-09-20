// import { Activity, Game, InPlayPlayer, OnDeckPlayer, PlayerGame, PlayerGameStatus, Positions, Team } from "../../server/db.js"
// import html from "../../server/html.js"
// import { activityGetAll, playerGameAllGet, playerGameSave, positionGetAll } from "../../server/repo-player-game.js"
// import { teamGet, teamSave } from "../../server/repo-team.js"
import html from "html-template-tag-stream"
import { PostHandlers, Route } from "../../server/route.js"
// import { when } from "../../server/shared.js"
// import { searchParams, sort, tail } from "../../server/utils.js"
import layout from "../_layout.html.js"
import { when } from "../../server/html.js"
// import { createIdNumber, required, validateObject } from "../../server/validation.js"
import { queryTeamIdGameIdValidator } from "../../server/validators.js"
import { validateObject } from "promise-validation"
import { searchParams, tail } from "../../server/utils.js"
import { teamGet } from "../../server/repo-team.js"
import { createIdNumber, createPositiveWholeNumber, required } from "../../server/validation.js"
import { NotPlayingPlayer, OutPlayer, PlayerGame, PlayerGameStatus } from "../../server/db.js"
import { playerGameAllGet, playerGameSave, positionGetAll } from "../../server/repo-player-game.js"
import { createPlayersView, filterInPlayPlayers, filterOnDeckPlayers, getAggregateGameTime } from "./shared.js"

function getPointsView(points: number) {
    return html`&nbsp;${points || "0"}&nbsp;`
}

function filterOutPlayers(x: PlayerGame) : x is PlayerGameStatus<OutPlayer> {
    return !x.status || x.status?._ === "out"
}

function filterNotPlayingPlayers(x: PlayerGame) : x is PlayerGameStatus<NotPlayingPlayer> {
    return x.status?._ === "notPlaying"
}

async function render(req: Request) {
    let { teamId, gameId } = await validateObject(searchParams(req), queryTeamIdGameIdValidator)
    let team = await teamGet(teamId)
    team.players = team.players.filter(x => x.active)
    let game = await required(team.games.find(x => x.id === gameId), "Could not find game ID!")
    let queryTeamGame = `teamId=${team.id}&gameId=${game.id}`
    let { start, total } = getAggregateGameTime(game.gameTime)

    let isInPlay = game.status === "play"
    let isEnded = game.status === "ended"
    let isPaused = game.status === "paused" || (!isInPlay && !isEnded)

    let [ players, { grid, positions } ] = await Promise.all([
        playerGameAllGet(teamId, gameId, team.players.map(x => x.id)),
        positionGetAll(teamId),
    ])

    let inPlayPlayers = await createPlayersView(filterInPlayPlayers, team.players, players, total)
    let inPlay = inPlayPlayers.length > 0

    let onDeckPlayers = await createPlayersView(filterOnDeckPlayers, team.players, players, total)
    let onDeck = onDeckPlayers.length > 0

    let outPlayers = await createPlayersView(filterOutPlayers, team.players, players, total)
    let out = outPlayers.length > 0

    let notPlayingPlayers = await createPlayersView(filterNotPlayingPlayers, team.players, players, total)
    let notPlaying = notPlayingPlayers.length > 0

    return html`
<h2>Game Play</h2>

<div>
    ${when(!isEnded, () => html`
    <form class=inline method=post action="?$${queryTeamGame}&handler=${isInPlay ? "pauseGame" : "startGame"}">
        <button>${isInPlay ? "Pause" : "Start"}</button>
    </form>`)}

    <game-timer
        $${when(isPaused, () => `data-flash data-start="${tail(game.gameTime)?.end}"`)}
        $${when(isInPlay, `data-start="${start}" data-total="${total}"`)}
        $${when(isEnded, `data-static`)}>
    </game-timer>

    <form class=inline method=post action="?$${queryTeamGame}&handler=${isEnded ? "restartGame" : "endGame"}">
        <button>${isEnded ? "Restart" : "End"}</button>
    </form>

    <ul class=list>
        <li>
            <span>Points</span>
            <form id=team-points class=inline method=post hidden></form>
            <button formaction="?$${queryTeamGame}&handler=pointsDec" form=team-points>-</button>
            <span id=points>${getPointsView(game.points)}</span>
            <button formaction="?$${queryTeamGame}&handler=pointsInc" form=team-points>+</button>
        </li>
        <li>
            <span>Opponent</span>
            <form id=opponent-points class=inline method=post hidden></form>
            <button formaction="?$${queryTeamGame}&handler=oPointsDec" form=opponent-points>-</button>
            <span id=o-points>${getPointsView(game.opponentPoints)}</span>
            <button formaction="?$${queryTeamGame}&handler=oPointsInc" form=opponent-points>+</button>
        </li>
    </ul>
</div>

<h3>In-Play</h3>

${when(!inPlay, () => html`<p>No players are in play.</p>`)}
${function* positionViews() {
    let count = 0
    for (let width of grid) {
        yield html`<div class="row grid-center">`
        let p = positions.slice(count, count + width)
        if (p.length < width) {
            p = p.concat(new Array(width - p.length).fill("None"))
        }
        yield p.map(() => {
            let player = inPlayPlayers.find(x => count === x.status.position)
            let view = html`<form method=post>${
            () => {
                return player
                    ? html`
                    <a href="?$${queryTeamGame}&playerId=${player.playerId}&handler=placePlayerOnDeck&playerSwap#game-swap-top">${player.name}</a>
                    <game-timer data-start=${player.start} data-total="${player.total}" ${when(!isInPlay, "data-static")}></game-timer>
                    <button formaction="?${queryTeamGame}&playerId=${player.playerId}&handler=playerNowOut">X</button>`
                : html`<span>No player.</span>`
            }
            }</form>`
            count++
            return view
        })
        yield html`</div>`
    }
}}

${when(onDeck, () => html`
<h3>On Deck</h3>

<ul class=list>
    ${onDeckPlayers.map(x => {
        return html`
    <li>
        <form method=post action="?$${queryTeamGame}&playerId=$${x.playerId}&handler=swap">
            <button>Swap</button>
        </form>
        <form method=post action="?$${queryTeamGame}&playerId=$${x.playerId}&handler=cancelOnDeck">
            <button class=danger>X</button>
        </form>
        <span>${x.name} - ${positions[x.status.targetPosition]}</span>
    </li>
    `})}
</ul>`)}

${when(onDeckPlayers.length > 1, () => html`
<form method=post action="?$${queryTeamGame}&handler=swapAll">
    <button>Swap All</button>
</form>`)}

${when(out, () => html`
<h3>Out</h3>

<ul class=list>
    ${outPlayers.map(x => {
        return html`
<li>
    <form method=post action="?$${queryTeamGame}&playerId=$${x.playerId}&handler=notPlaying">
        <button>X</button>
    </form>
    <a href="?$${queryTeamGame}&playerId=${x.playerId}&handler=placePlayerOnDeck&playerSwap#game-swap-top">${x.name}</a>
    <game-timer data-total="${x.total}" data-static></game-timer>
</li>
        `
    })}
</ul>`)}

${when(notPlaying, () => html`
<h3>Not Playing</h3>
<ul class=list>
    ${notPlayingPlayers.map(x => html`
    <li>
        <p>${x.name}</p>
        <form method=post action="?${queryTeamGame}&playerId=${x.playerId}&handler=backIn">
            <button>Back in</button>
        </form>
    </li>`)}
</ul>`)}

`
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

async function swap({ teamId, playerIds, gameId, timestamp } : { teamId : number, playerIds: number[], gameId: number, timestamp: number }) {
    let [team, players] = await Promise.all([teamGet(teamId), playerGameAllGet(teamId, gameId, playerIds)])
    let game = await required(team.games.find(x => x.id === gameId), "Could not find game ID!")
    for (let player of players) {
        let gameTime = tail(player.gameTime)
        if (player.status?._ === "onDeck" && player.status.targetPosition != null && player.status.currentPlayerId) {
            let [currentPlayer] = await playerGameAllGet(teamId, gameId, [player.status.currentPlayerId])
            let currentPlayerGameTime = tail(currentPlayer.gameTime)
            currentPlayerGameTime.end = timestamp
            currentPlayer.status = { _: "out" }
            await playerGameSave(teamId, currentPlayer)
        }
        if (game.status === "play") {
            gameTime.start = timestamp
        }

        let position = await createPositiveWholeNumber("Player position number")(getPlayerPosition(player))

        player.status = {
            _: "inPlay",
            position,
        }
        await playerGameSave(teamId, player)
    }
}

const queryTeamGamePlayerValidator = {
    ...queryTeamIdGameIdValidator,
    playerId: createIdNumber("Query Player Id")
}

const postHandlers : PostHandlers = {
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

    playerNowOut: async ({ query }) => {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let [p] = await playerGameAllGet(teamId, gameId, [playerId])
        p.status = { _: "out" }
        tail(p.gameTime).end = +new Date()
        await playerGameSave(teamId, p)
    },

    cancelOnDeck: async ({ query }) => {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let [player] = await playerGameAllGet(teamId, gameId, [playerId])
        player.status = { _: "out" }
        player.gameTime.pop()
        await playerGameSave(teamId, player)
    },

    notPlaying: async ({ query }) => {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let [player] = await playerGameAllGet(teamId, gameId, [playerId])
        player.status = { _: "notPlaying" }
        await playerGameSave(teamId, player)
    },

    backIn: async ({ query }) => {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let [player] = await playerGameAllGet(teamId, gameId, [playerId])
        player.status = { _: "out" }
        await playerGameSave(teamId, player)
    },
}

const route : Route = {
    route: (url: URL) =>
        url.pathname.endsWith("/games/")
        && ["gameId", "teamId"].every(x => url.searchParams.has(x)),
    async get(req: Request) {
        return layout(req, { main: (await render(req)), title: "Game Play" })
    },
    post: postHandlers,
}

export default route


// interface PlayerGameView extends PlayerGame {
//     name: string
// }
//
// interface View {
//     team: Team
//     playersGame: PlayerGameView[]
//     game: Game
//     positions: Positions
//     activities: Activity[]
// }
//
// async function start(req : Request) : Promise<View> {
//     let { teamId, gameId } = await validateObject(searchParams(req), queryTeamIdGameIdValidator)
//     let team = await teamGet(teamId)
//     team.players = team.players.filter(x => x.active)
//     let game = await required(team.games.find(x => x.id === gameId), "Could not find game ID!")
//     let [playersGame, positions, { activities }] = await Promise.all([
//         playerGameAllGet(teamId, gameId, team.players.map(x => x.id)),
//         positionGetAll(teamId),
//         activityGetAll(teamId),
//     ])
//
//     sort(activities, x => x.name)
//
//     let playersGameView : PlayerGameView[] = playersGame.map(x => ({
//         ...x,
//         name: team.players.find(y => x.playerId === y.id)?.name ?? ""
//     }))
//
//     return {
//         team,
//         playersGame: playersGameView,
//         game,
//         positions,
//         activities,
//     }
// }
//
//
//
// function render({ team, playersGame, game, positions: { positions, grid } }: View) {
//     let queryTeamGame = `teamId=${team.id}&gameId=${game.id}`
//     let inPlayPlayers_ : PlayerGameStatus<InPlayPlayer>[] =
//         <any>playersGame.filter(filterInPlayPlayers)
//     let currentTime = +new Date()
//     let inPlayPlayers = inPlayPlayers_.map(x => {
//         let { start, total } = getAggregateGameTime(x.gameTime)
//         let calcTotal = total + (start ? currentTime - start : 0)
//         return { calcTotal, start, total, ...x }
//     })
//     inPlayPlayers.sort((a, b) => a.calcTotal - b.calcTotal)
//     let inPlay = inPlayPlayers.length > 0
//     let onDeckPlayers : PlayerGameStatus<OnDeckPlayer>[] = <any>playersGame.filter(filterOnDeckPlayers)
//     let toReplacePlayerIds = new Set(onDeckPlayers.map(x => (x.status as { playerId?: number }).playerId).filter(x => x))
//     let onDeck = onDeckPlayers.length > 0
//     let out = playersGame.filter(filterOutPlayers).length > 0
//     let { start, total } = getAggregateGameTime(game.gameTime)
//     let availablePlayersToSwap = inPlayPlayers
//         .filter(x => !onDeckPlayers.find((y: any) => y.status.playerId === x.playerId))
//     let outPlayers =
//         playersGame.filter(filterOutPlayers)
//         .map(x => {
//             let { total } = getAggregateGameTime(x.gameTime)
//             return { ...x, total }
//         })
//         .sort((a, b) => a.total - b.total)
//     let notPlayingPlayers = playersGame.filter(filterNotPlayingPlayers)
//     let notPlaying = notPlayingPlayers.length > 0
//
//     let isInPlay = false
//     let isPaused = false
//     let isEnded = false
//     switch (game.status) {
//         case "paused": isPaused = true; break
//         case "play": isInPlay = true; break
//         case "ended": isEnded = true; break
//         default: isPaused = true
//     }
//
//
//
//
//
// `
// }
//
//
//
// const dataActivityIdValidator = {
//     activityId: createIdNumber("Activity")
// }
//
// // const dataPositionIdValidator = {
// //     positionId: createIdNumber("Position")
// // }
//
//
// function setPoints(f: (game: Game) => number) {
//     return async ({ query } : { query: any }) => {
//         let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
//         let team = await teamGet(teamId)
//         let game = await required(team.games.find(x => x.id === gameId), "Could not find game!")
//         let points = f(game)
//         if (points >= 0) {
//             await teamSave(team)
//         } else {
//             points = 0
//         }
//     }
// }
//
// const postHandlers : PostHandlers = {
//     pointsInc: setPoints(game => ++game.points),
//     pointsDec: setPoints(game => --game.points),
//     oPointsDec: setPoints(game => --game.opponentPoints),
//     oPointsInc: setPoints(game => ++game.opponentPoints),
//
//     addPlayerPosition: async ({ }) => {
//         // let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
//         // let [p] = await playerGameAllGet(teamId, gameId, [playerId])
//         // p.status = { _: "onDeck" }
//         // let gameTime = p.gameTime.find(x => !x.end)
//         // if (!gameTime) {
//         //     gameTime = {
//         //         positionId: positionObj.id
//         //     }
//         //     p.gameTime.push(gameTime)
//         // }
//         // await playerGameSave(teamId, p)
//     },
//
//
//
//     // onDeckWith: async ({ query, data }) => {
//     //     let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
//     //     let { swapPlayerId } = await validateObject(data, { swapPlayerId: createIdNumber("Swap Player Id") })
//     //     let [player, swapPlayer] = await playerGameAllGet(teamId, gameId, [playerId, swapPlayerId])
//     //     player.status = { _: "onDeck", playerId: swapPlayer.playerId }
//     //     let gameTime = tail(player.gameTime)
//     //     if (!gameTime || gameTime.end) {
//     //         gameTime = {
//     //             positionId: tail(swapPlayer.gameTime).positionId
//     //         }
//     //         player.gameTime.push(gameTime)
//     //     } else {
//     //         gameTime.positionId = tail(swapPlayer.gameTime).positionId
//     //     }
//     //     await playerGameSave(teamId, player)
//     // },
//
//
//     startGame: async ({ query }) => {
//         let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
//         let timestamp = +new Date()
//         let team = await teamGet(teamId)
//
//         let game = await required(team.games.find(x => x.id === gameId), `Could not find game! ${gameId}`)
//         game.status = "play"
//         game.gameTime.push({
//             start: timestamp
//         })
//         await teamSave(team)
//
//         let players = await playerGameAllGet(teamId, gameId, team.players.map(x => x.id))
//         let inPlayPlayers = players.filter(x => x.status?._ === "inPlay")
//         for (let player of inPlayPlayers) {
//             let gameTime = tail(player.gameTime)
//             gameTime.start = timestamp
//             await playerGameSave(teamId, player)
//         }
//     },
//
//     // pauseGame: async ({ query }) => {
//     //     let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
//     //     let timestamp = +new Date()
//     //     let team = await teamGet(teamId)
//     //
//     //     let game = await required(team.games.find(x => x.id === gameId), `Could not find game! ${gameId}`)
//     //     game.status = "paused"
//     //     let time = tail(game.gameTime)
//     //     if (time) {
//     //         time.end = timestamp
//     //     }
//     //     await teamSave(team)
//     //
//     //     let players = await playerGameAllGet(teamId, gameId, team.players.map(x => x.id))
//     //     let inPlayPlayers = players.filter(x => x.status?._ === "inPlay")
//     //     for (let player of inPlayPlayers) {
//     //         let gameTime = tail(player.gameTime)
//     //         if (gameTime) {
//     //             gameTime.end = timestamp
//     //             player.gameTime.push({
//     //                 positionId: gameTime.positionId
//     //             })
//     //         }
//     //         await playerGameSave(teamId, player)
//     //     }
//     // },
//
//
//
//
//     // positionChange: async ({ query, data }) => {
//     //     let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
//     //     let { positionId } = await validateObject(data, dataPositionIdValidator)
//     //     let [player] = await playerGameAllGet(teamId, gameId, [playerId])
//     //     let timestamp = +new Date()
//     //     tail(player.gameTime).end = timestamp
//     //     player.gameTime.push({
//     //         positionId,
//     //         start: timestamp,
//     //     })
//     //     await playerGameSave(teamId, player)
//     // },
//
//     activityMarker: async ({ query, data }) => {
//         let { teamId, gameId, playerId } = await validateObject(query, queryTeamGamePlayerValidator)
//         let { activityId } = await validateObject(data, dataActivityIdValidator)
//         let [player] = await playerGameAllGet(teamId, gameId, [playerId])
//         let stat = player.stats.find(x => x.statId === activityId)
//         if (!stat) {
//             player.stats.push({ count: 1, statId: activityId })
//         } else {
//             stat.count++
//         }
//         await playerGameSave(teamId, player)
//     },
//
//     endGame: async ({ query }) => {
//         let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
//         let timestamp = +new Date()
//         let team = await teamGet(teamId)
//
//         let game = await required(team.games.find(x => x.id === gameId), `Could not find game! ${gameId}`)
//         game.status = "ended"
//         let time = tail(game.gameTime)
//         if (time && !time.end) {
//             time.end = timestamp
//         }
//         await teamSave(team)
//
//         let players = await playerGameAllGet(teamId, gameId, team.players.map(x => x.id))
//         for (let player of players) {
//             let gameTime = tail(player.gameTime)
//             if (gameTime && gameTime.start && !gameTime.end) {
//                 gameTime.end = timestamp
//             }
//             if (player.status?._ !== "notPlaying") {
//                 player.status = { _: "out"}
//             }
//             await playerGameSave(teamId, player)
//         }
//     },
//
//     restartGame: async ({ query }) => {
//         let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
//         let team = await teamGet(teamId)
//         let game = await required(team.games.find(x => x.id === gameId), `Could not find game! ${gameId}`)
//         game.status = "paused"
//         await teamSave(team)
//     },
//
// }
//
// async function get(req: Request) {
//     let result = await start(req)
//     let head = `
//         <style>
//             .auto-select {
//                 width: 2em;
//                 appearance: none;
//             }
//             .auto-select:focus {
//                 width: auto;
//                 appearance: auto;
//             }
//             ul.list {
//                 border-collapse: collapse;
//             }
//             .round > *:first-child {
//                 border-radius: var(--rc) 0 0 var(--rc);
//             }
//             .round > *:last-child {
//                 border-radius: 0 var(--rc) var(--rc) 0;
//             }
//         </style>
//         <script src="/web/js/game-timer.js"></script>`
//     return layout(req, {
//         main: html`
// <h2>${result.team.name} - Game ${result.game.date} ${when(result.game.opponent, x => ` - ${x}`)}</h2>
// <div id=refresh>
// ${render(result)}
// </div>
// <form id=reload-form action="?teamId=${result.team.id}&gameId=${result.game.id}&handler=reload" hidden>
// </form>`,
//         head,
//         scripts: [ "/web/js/game-play.js" ],
//         title: `${result.team.name} - Game ${result.game.date} - ${result.game.opponent}`,
//     })
// }
//
// async function reload(req: Request) {
//     let result = await start(req)
//     return render(result)
// }
//
// const route : Route = {
//     route: (url: URL) => url.pathname.endsWith("/games/") && ["gameId", "teamId"].every(x => url.searchParams.has(x)),
//     async get(req: Request) {
//         let params = searchParams<{ handler?: "reload" }>(req)
//         if (params.handler === "reload") {
//             return reload(req)
//         }
//         return get(req)
//     },
//     post: postHandlers,
// }
//
// export default route
