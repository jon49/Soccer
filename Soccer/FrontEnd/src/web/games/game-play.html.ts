import { Activity, cache, Game, GameTime, Message, PlayerGame, Position, Team } from "../server/db"
import html from "../server/html-template-tag"
import { activityGetAll, playerGameAllGet, playerGameSave, positionGetAll } from "../server/repo-player-game"
import { teamGet, teamSave } from "../server/repo-team"
import { Route, PostHandlers } from "../server/route"
import { messageView, when } from "../server/shared"
import { searchParams, sort } from "../server/utils"
import { createIdNumber, required, validateObject } from "../server/validation"
import { queryTeamIdGameIdValidator } from "../server/validators"
import layout from "../_layout.html"

interface PlayerGameView extends PlayerGame {
    name: string
}

interface View {
    team: Team
    playersGame: PlayerGameView[]
    game: Game
    positions: Position[]
    activities: Activity[]
    posted: string | undefined
    message: Message
}

async function start(req : Request) : Promise<View> {
    let { teamId, gameId } = await validateObject(searchParams(req), queryTeamIdGameIdValidator)
    let [team, posted, message] = await Promise.all([
        teamGet(teamId),
        cache.pop("posted"),
        cache.pop("message")
    ])
    team.players = team.players.filter(x => x.active)
    let game = await required(team.games.find(x => x.id === gameId), "Could not find game ID!")
    let [playersGame, { positions }, { activities }] = await Promise.all([
        playerGameAllGet(teamId, gameId, team.players.map(x => x.id)),
        positionGetAll(teamId),
        activityGetAll(teamId),
    ])

    sort(positions, x => x.name)
    sort(activities, x => x.name)

    let playersGameView : PlayerGameView[] = playersGame.map(x => ({
        ...x,
        name: team.players.find(y => x.playerId === y.id)?.name ?? ""
    }))

    return {
        team,
        playersGame: playersGameView,
        game,
        positions,
        activities,
        posted,
        message,
    }
}

function getPositionName(positions: Position[], gameTimes: GameTime[]) {
    let positionId = tail(gameTimes)?.positionId
    return positions.find(x => x.id === positionId)?.name
}

function tail<T>(xs: T[]) : T {
    return xs.slice(-1)[0]
}

const filterOutPlayers = (x: PlayerGameView) => !x.status || x.status?._ === "out"
const filterInPlayPlayers = (x: PlayerGameView) => x.status?._ === "inPlay"
const filterOnDeckPlayers = (x: PlayerGameView) => x.status?._ === "onDeck"
const filterNotPlayingPlayers = (x: PlayerGameView) => x.status?._ === "notPlaying"

function getAggregateGameTime(times: { start?: number, end?: number }[]) {
    let start = times.find(x => !x.end)?.start
    let total =
        times.reduce((acc, { end, start }) =>
            end && start ? acc + (end - start) : acc
        , 0)
    return { start, total }
}

function render({ team, playersGame, game, positions, posted, message }: View) {
    let queryTeamGame = `teamId=${team.id}&gameId=${game.id}`
    let inPlayPlayers_ = playersGame.filter(filterInPlayPlayers)
    let currentTime = +new Date()
    let inPlayPlayers = inPlayPlayers_.map(x => {
        let { start, total } = getAggregateGameTime(x.gameTime)
        let calcTotal = total + (start ? currentTime - start : 0)
        return { calcTotal, start, total, ...x }
    })
    inPlayPlayers.sort((a, b) => a.calcTotal - b.calcTotal)
    let inPlay = inPlayPlayers.length > 0
    let onDeckPlayers = playersGame.filter(filterOnDeckPlayers)
    let toReplacePlayerIds = new Set(onDeckPlayers.map(x => (x.status as { playerId?: number }).playerId).filter(x => x))
    let onDeck = onDeckPlayers.length > 0
    let out = playersGame.filter(filterOutPlayers).length > 0
    let { start, total } = getAggregateGameTime(game.gameTime)
    let availablePlayersToSwap = inPlayPlayers
        .filter(x => !onDeckPlayers.find((y: any) => y.status.playerId === x.playerId))
    let outPlayers =
        playersGame.filter(filterOutPlayers)
        .map(x => {
            let { total } = getAggregateGameTime(x.gameTime)
            return { ...x, total }
        })
        .sort((a, b) => a.total - b.total)
    let notPlayingPlayers = playersGame.filter(filterNotPlayingPlayers)
    let notPlaying = notPlayingPlayers.length > 0

    let positionsTaken =
        new Set(
        playersGame
        .filter(x => x.status?._ === "inPlay" || x.status?._ === "onDeck")
        .map(x => tail(x.gameTime).positionId))
    let availablePositions =
        positions.filter(x => !positionsTaken.has(x.id))

    let isInPlay = false
    let isPaused = false
    let isEnded = false
    switch (game.status) {
        case "paused": isPaused = true; break
        case "play": isInPlay = true; break
        case "ended": isEnded = true; break
        default: isPaused = true
    }

    return html`
<div>
    ${when(!isEnded, () => html`
    <form class=inline method=post action="?$${queryTeamGame}&handler=${isInPlay ? "pauseGame" : "startGame"}">
        <button>${isInPlay ? "Pause" : "Start"}</button>
    </form>`)}

    <game-timer
        $${when(isPaused, () => `data-flash data-start="${tail(game.gameTime)?.end}"`)}
        $${when(isInPlay, () => `data-start="${start}" data-total="${total}"`)}
        $${when(isEnded, `data-static`)}
        >
    </game-timer>

    <form class=inline method=post action="?$${queryTeamGame}&handler=${isEnded ? "restartGame" : "endGame"}">
        <button>${isEnded ? "Restart" : "End"}</button>
    </form>
    <ul class=list>
        <li>
            <span>Points</span>
            <form id=team-points class=inline method=post hidden></form>
            <button formaction="?$${queryTeamGame}&handler=pointsDec" target="#points" form=team-points>-</button>
            <span id=points>${getPointsView(game.points)}</span>
            <button formaction="?$${queryTeamGame}&handler=pointsInc" target="#points" form=team-points>+</button>
        </li>
        <li>
            <span>Opponent</span>
            <form id=opponent-points class=inline method=post hidden></form>
            <button formaction="?$${queryTeamGame}&handler=oPointsDec" target="#o-points" form=opponent-points>-</button>
            <span id=o-points>${getPointsView(game.opponentPoints)}</span>
            <button formaction="?$${queryTeamGame}&handler=oPointsInc" target="#o-points" form=opponent-points>+</button>
        </li>
    </ul>
</div>

<h3>In-Play</h3>
${when(!inPlay, html`<p>No players are in play.</p>`)}
<ul class=list>
    ${inPlayPlayers.map(x => {
        let baseQuery : string = `${queryTeamGame}&playerId=${x.playerId}`
        let positionId = tail(x.gameTime).positionId
        let position = positions.find(x => x.id === positionId)?.name
        let playerInfoId = `in-play-${x.playerId}`
        return html`
    <li $${when(toReplacePlayerIds.has(x.playerId), `class="highlight round"`)}>
        <form method=post action="?$${baseQuery}&handler=playerNowOut" >
            <button>X</button>
        </form>
        <span id=${playerInfoId}>${inPlayPlayerInfoView(x.name, position)}</span>
        <game-timer data-start=${x.start} data-total="${x.total}" ${when(!isInPlay, "data-static")}></game-timer>
        <form
            target=#${playerInfoId}
            method=post
            action="?$${baseQuery}&handler=positionChange"
            onchange="this.requestSubmit()" >
            <select name=positionId class="auto-select button">
                <option selected>#</option>
                ${positions.map(position => html`
                <option value="${position.id}">${position.name}</option>`)}
            </select>
        </form>
    </li>`})}
</ul>

${when(onDeck, () => html`
<h3>On Deck</h3>

<ul class=list>
    ${playersGame.filter(filterOnDeckPlayers).map(x => {
        let inPlayId = x.status?._ === "onDeck" ? x.status.playerId : null
        let inPlayName : string | undefined
        if (inPlayId) {
            inPlayName = inPlayPlayers.find(x => x.playerId === inPlayId)?.name
        }
        let position = getPositionName(positions, x.gameTime)
        return html`
    <li>
        <form method=post action="?$${queryTeamGame}&playerId=$${x.playerId}&handler=swap">
            <button>Swap</button>
        </form>
        <form method=post action="?$${queryTeamGame}&playerId=$${x.playerId}&handler=cancelOnDeck">
            <button class=danger>X</button>
        </form>
        <span>${x.name}${when(inPlayName, x => html` for ${x}`)} ${when(position, x => html` - ${x}`)}</span>
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
        ${when(posted === `player:${x.playerId}`, () => messageView(message))}
    <li>
        <form method=post action="?$${queryTeamGame}&playerId=$${x.playerId}&handler=notPlaying">
            <button>X</button>
        </form>
        <p>${x.name}</p>
        ${when(availablePlayersToSwap.length > 0, _ =>
            html`
        <form method=post action="?$${queryTeamGame}&playerId=$${x.playerId}&handler=onDeckWith" onchange="this.requestSubmit()">
            <select name="swapPlayerId" class="auto-select button" style="width: 2.5em;">
                <option selected>🏃</option>
                ${availablePlayersToSwap.map(x => html`
                <option is=game-timer-is value="${x.playerId}" data-total="${x.calcTotal}">
                    ${x.name} - ${getPositionName(positions, x.gameTime)} - 
                </option>`) }
            </select>
        </form>`)}
        <form method=post
              action="?$${queryTeamGame}&playerId=$${x.playerId}&handler=addPlayerPosition"
              onchange="this.requestSubmit()">
            <select class="auto-select button" name=positionId>
                <option selected>#</option>
                ${availablePositions.map(x => html`<option value=${x.id}>${x.name}</option>`)}
            </select>
        </form>
        <game-timer data-total="${x.total}" data-static></game-timer>
    </li>
        `
    })}
</ul>`)}

${when(notPlaying, html`
<h3>Not Playing</h3>
<ul class=list>
    ${notPlayingPlayers.map(x => html`
    <li>
        <p>${x.name}</p>
        <form method=post action="?${queryTeamGame}&playerId=${x.playerId}&handler=backIn">
            <button>Back in</button>
        </form>
    </li>
    `)}
</ul>
`)}
`
}

function statsView(activities: Activity[], player: PlayerGame) {
    return html`
    ${player.stats.map(x => {
        let statName = activities.find(y => y.id === x.statId)?.name
        return html`<div>${statName} - ${x.count}</div>`
    })}`
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

function getPointsView(points: number) {
    return html`&nbsp;${points || "0"}&nbsp;`
}

const queryTeamGamePlayerValidator = {
    ...queryTeamIdGameIdValidator,
    playerId: createIdNumber("Query Player Id")
}

const dataActivityIdValidator = {
    activityId: createIdNumber("Activity")
}

const dataPositionIdValidator = {
    positionId: createIdNumber("Position")
}

async function swap({ teamId, playerIds, gameId, timestamp } : { teamId : number, playerIds: number[], gameId: number, timestamp: number }) {
    let [team, players] = await Promise.all([teamGet(teamId), playerGameAllGet(teamId, gameId, playerIds)])
    let game = await required(team.games.find(x => x.id === gameId), "Could not find game ID!")
    for (let player of players) {
        let gameTime = tail(player.gameTime)
        if (player.status?._ === "onDeck" && player.status.playerId) {
            let [swapPlayer] = await playerGameAllGet(teamId, gameId, [player.status.playerId])
            let swapGameTime = tail(swapPlayer.gameTime)
            swapGameTime.end = timestamp
            swapPlayer.status = { _: "out" }
            await playerGameSave(teamId, swapPlayer)
        }
        if (game.status === "play") {
            gameTime.start = timestamp
        }
        player.status = { _: "inPlay" }
        await playerGameSave(teamId, player)
    }
}

function inPlayPlayerInfoView(playerName: string | undefined, positionName: string | undefined) {
    return html`${playerName} - ${positionName}`
}

const postHandlers : PostHandlers = {
    pointsInc: setPoints(game => ++game.points),
    pointsDec: setPoints(game => --game.points),
    oPointsDec: setPoints(game => --game.opponentPoints),
    oPointsInc: setPoints(game => ++game.opponentPoints),

    addPlayerPosition: async ({ data, query }) => {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        await cache.push({ posted: `player:${playerId}` })
        let { positionId } = await validateObject(data, dataPositionIdValidator)
        let positionObj = await required((await positionGetAll(teamId)).positions.find(x => x.id = positionId), `Could not find position!`)
        let [p] = await playerGameAllGet(teamId, gameId, [playerId])
        p.status = { _: "onDeck" }
        let gameTime = p.gameTime.find(x => !x.end)
        if (!gameTime) {
            gameTime = {
                positionId: positionObj.id
            }
            p.gameTime.push(gameTime)
        }
        await playerGameSave(teamId, p)
    },

    swap: async ({ query }) => {
        let { gameId, playerId, teamId } = await validateObject(query, queryTeamGamePlayerValidator)
        await cache.push({ posted: `player:${playerId}` })
        await swap({ gameId, teamId, playerIds: [playerId], timestamp: +new Date() })
    },

    playerNowOut: async ({ query }) => {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        await cache.push({ posted: `player:${playerId}` })
        let [p] = await playerGameAllGet(teamId, gameId, [playerId])
        p.status = {_: "out"}
        tail(p.gameTime).end = +new Date()
        await playerGameSave(teamId, p)
    },

    onDeckWith: async ({ query, data }) => {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let { swapPlayerId } = await validateObject(data, { swapPlayerId: createIdNumber("Swap Player Id") })
        await cache.push({ posted: `player:${playerId}` })
        let [player, swapPlayer] = await playerGameAllGet(teamId, gameId, [playerId, swapPlayerId])
        player.status = { _: "onDeck", playerId: swapPlayer.playerId }
        let gameTime = tail(player.gameTime)
        if (!gameTime || gameTime.end) {
            gameTime = {
                positionId: tail(swapPlayer.gameTime).positionId
            }
            player.gameTime.push(gameTime)
        } else {
            gameTime.positionId = tail(swapPlayer.gameTime).positionId
        }
        await playerGameSave(teamId, player)
    },

    swapAll: async ({ query }) => {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        await cache.push({ posted: "swap-all" })
        let team = await teamGet(teamId)
        let players = await playerGameAllGet(teamId, gameId, team.players.map(x => x.id))
        let onDeckPlayers = players.filter(x => x.status?._ === "onDeck")
        await swap({ gameId, teamId, playerIds: onDeckPlayers.map(x => x.playerId), timestamp: +new Date() })
    },

    startGame: async ({ query }) => {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        await cache.push({ posted: "start-game" })
        let timestamp = +new Date()
        let team = await teamGet(teamId)

        let game = await required(team.games.find(x => x.id === gameId), `Could not find game! ${gameId}`)
        game.status = "play"
        game.gameTime.push({
            start: timestamp
        })
        await teamSave(team)

        let players = await playerGameAllGet(teamId, gameId, team.players.map(x => x.id))
        let inPlayPlayers = players.filter(x => x.status?._ === "inPlay")
        for (let player of inPlayPlayers) {
            let gameTime = tail(player.gameTime)
            gameTime.start = timestamp
            await playerGameSave(teamId, player)
        }
    },

    pauseGame: async ({ query }) => {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        await cache.push({ posted: "pause-game" })
        let timestamp = +new Date()
        let team = await teamGet(teamId)

        let game = await required(team.games.find(x => x.id === gameId), `Could not find game! ${gameId}`)
        game.status = "paused"
        let time = tail(game.gameTime)
        if (time) {
            time.end = timestamp
        }
        await teamSave(team)

        let players = await playerGameAllGet(teamId, gameId, team.players.map(x => x.id))
        let inPlayPlayers = players.filter(x => x.status?._ === "inPlay")
        for (let player of inPlayPlayers) {
            let gameTime = tail(player.gameTime)
            if (gameTime) {
                gameTime.end = timestamp
                player.gameTime.push({
                    positionId: gameTime.positionId
                })
            }
            await playerGameSave(teamId, player)
        }
    },

    cancelOnDeck: async ({ query }) => {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        await cache.push({ posted: `player:${playerId}` })
        let [player] = await playerGameAllGet(teamId, gameId, [playerId])
        player.status = { _: "out" }
        player.gameTime.pop()
        await playerGameSave(teamId, player)
    },

    notPlaying: async ({ query }) => {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        await cache.push({ posted: `player:${playerId}` })
        let [player] = await playerGameAllGet(teamId, gameId, [playerId])
        player.status = { _: "notPlaying" }
        await playerGameSave(teamId, player)
    },

    backIn: async ({ query }) => {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        await cache.push({ posted: `player:${playerId}` })
        let [player] = await playerGameAllGet(teamId, gameId, [playerId])
        player.status = { _: "out" }
        await playerGameSave(teamId, player)
    },

    positionChange: async ({ query, data }) => {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let { positionId } = await validateObject(data, dataPositionIdValidator)
        await cache.push({ posted: `player:${playerId}` })
        let [player] = await playerGameAllGet(teamId, gameId, [playerId])
        let timestamp = +new Date()
        tail(player.gameTime).end = timestamp
        player.gameTime.push({
            positionId,
            start: timestamp,
        })
        await playerGameSave(teamId, player)
    },

    activityMarker: async ({ query, data }) => {
        let { teamId, gameId, playerId } = await validateObject(query, queryTeamGamePlayerValidator)
        let { activityId } = await validateObject(data, dataActivityIdValidator)
        let [player] = await playerGameAllGet(teamId, gameId, [playerId])
        let stat = player.stats.find(x => x.statId === activityId)
        if (!stat) {
            player.stats.push({ count: 1, statId: activityId })
        } else {
            stat.count++
        }
        await playerGameSave(teamId, player)
        let { activities } = await activityGetAll(teamId)
        return statsView(activities, player)
    },

    endGame: async ({ query }) => {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        let timestamp = +new Date()
        let team = await teamGet(teamId)

        let game = await required(team.games.find(x => x.id === gameId), `Could not find game! ${gameId}`)
        game.status = "ended"
        let time = tail(game.gameTime)
        if (time && !time.end) {
            time.end = timestamp
        }
        await teamSave(team)

        let players = await playerGameAllGet(teamId, gameId, team.players.map(x => x.id))
        for (let player of players) {
            let gameTime = tail(player.gameTime)
            if (gameTime && gameTime.start && !gameTime.end) {
                gameTime.end = timestamp
            }
            if (player.status?._ !== "notPlaying") {
                player.status = { _: "out"}
            }
            await playerGameSave(teamId, player)
        }
    },

    restartGame: async ({ query }) => {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        let team = await teamGet(teamId)
        let game = await required(team.games.find(x => x.id === gameId), `Could not find game! ${gameId}`)
        game.status = "paused"
        await teamSave(team)
    },

}

async function get(req: Request) {
    let result = await start(req)
    let template = await layout(req)
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
        <script src="/web/js/game-timer.v5.js"></script>
    `
    return template({
        main: html`
<h2>${result.team.name} - Game ${result.game.date} ${when(result.game.opponent, x => ` - ${x}`)}</h2>
<div id=refresh>
${render(result)}
</div>
<form id=reload-form action="?teamId=${result.team.id}&gameId=${result.game.id}&handler=reload" target=#refresh hidden>
</form>`,
        head,
        scripts: [ "/web/js/game-play.v4.js" ] })
}

async function reload(req: Request) {
    let result = await start(req)
    return render(result)
}

const route : Route = {
    route: (url: URL) => url.pathname.endsWith("/games/") && ["gameId", "teamId"].every(x => url.searchParams.has(x)),
    async get(req: Request) {
        let params = searchParams<{ handler?: "reload" }>(req)
        if (params.handler === "reload") {
            return reload(req)
        }
        return get(req)
    },
    post: postHandlers,
}

export default route
