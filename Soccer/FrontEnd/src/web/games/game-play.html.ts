import { Activity, cache, Game, GameTime, Message, PlayerGame, Position, Team } from "../js/db"
import html from "../js/html-template-tag"
import { activityGetAll, playerGameAllGet, playerGameSave, positionCreateOrGet, positionGetAll } from "../js/repo-player-game"
import { teamGet, teamSave } from "../js/repo-team"
import { Route, PostHandlers, handlePost } from "../js/route"
import { messageView, when } from "../js/shared"
import { searchParams, sort } from "../js/utils"
import { createIdNumber, createString25, required, validateObject } from "../js/validation"
import { queryTeamIdGameIdValidator } from "../js/validators"
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
    let game = await required(team.games.find(x => x.id === gameId), "Could not find game ID!")
    let [playersGame, positions, activities] = await Promise.all([
        playerGameAllGet(teamId, gameId, team.players.map(x => x.playerId)),
        positionGetAll(teamId),
        activityGetAll(teamId),
    ])

    sort(positions, x => x.name)
    sort(activities, x => x.name)

    let playersGameView : PlayerGameView[] = playersGame.map(x => ({
        ...x,
        name: team.players.find(y => x.playerId === y.playerId)?.name ?? ""
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

function getPositionName(positions: Position[], gameTime: GameTime[]) {
    return positions.find(y => y.id === gameTime.find(x => !x.end)?.positionId)?.name
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

function formatTime(time: number) {
    let d = new Date(time)
    let hours = time/1e3/60/60|0
    return `${ hours ? ""+hours+":" : "" }${(""+d.getMinutes()).padStart(2, "0")}:${(""+d.getSeconds()).padStart(2, "0")}`
}

function render({ team, playersGame, game, positions, activities, posted, message }: View) {
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
    return html`
<h2>${team.name} - Game ${game.date} ${when(game.opponent, x => ` - ${x}`)}</h2>
<div>
    <form class=inline method=post action="?$${queryTeamGame}&handler=${game.status === "play" ? "pauseGame" : "startGame"}">
        <button>${game.status === "play" ? "Pause" : "Start"}</button>
    </form>
    <game-timer data-timer-start=${start} data-timer-total=${total}></game-timer>
    <span>Points</span>
    <form class=inline method=post>
        <button formaction="?$${queryTeamGame}&handler=pointsDec" target="#points">-</button>
        <span id=points>&nbsp;${getPointsView(game.points)}&nbsp;</span>
        <button formaction="?$${queryTeamGame}&handler=pointsInc" target="#points">+</button>
    </form>
    <span>Opponent</span>
    <form class=inline method=post>
        <button formaction="?$${queryTeamGame}&handler=oPointsDec" target="#o-points">-</button>
        <span id=o-points>&nbsp;${getPointsView(game.opponentPoints)}&nbsp;</span>
        <button formaction="?$${queryTeamGame}&handler=oPointsInc" target="#o-points">+</button>
    </form>
</div>

<h3>In-Play</h3>
${when(!inPlay, html`<p>No players are in play.</p>`)}
<ul class=list>
    ${inPlayPlayers.map((x, i) => {
        let baseQuery = `${queryTeamGame}&playerId=${x.playerId}`
        return html`
    <li>
        <form method=post action="?$${baseQuery}&handler=playerNowOut" >
            <button>X</button>
        </form>
        <span>${x.name}</span>
        <form
            method=post
            action="?$${baseQuery}&handler=positionChange"
            onchange="this.requestSubmit()">
            <select name=positionId>
                ${positions.map(position => html`
                <option value="${position.id}" ${when(position.id === x.gameTime.slice(-1)[0].positionId, "selected")}>${position.name}</option>`)}
            </select>
        </form>
        <form
            method=post
            action="?$${baseQuery}&handler=activityMarker"
            target="in-play-activity-${i}"
            onchange="this.requestSubmit()"
            >
            <input
                id=in-play-activity-${i}
                type=search
                name=activity
                list=activities
                autocomplete=off
                placeholder="Mark an activity" >
        </form>
        ${when(game.status === "play", html`
        <game-timer
            data-timer-start=${x.start}
            data-timer-total=${x.total}></game-timer>
        `)}
    </li>
    `})}
</ul>

<h3>On Deck</h3>

${when(!onDeck, html`<p>No players are on deck.</p>`)}

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
</ul>

<form method=post action="?$${queryTeamGame}&handler=swapAll">
    <button>Swap All</button>
</form>

<h3>Out</h3>

${when(!out, html`<p>No players are currently out.</p>`)}

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
        <form method=post action="?$${queryTeamGame}&playerId=$${x.playerId}&handler=onDeckWith" onchange="this.submit()">
            <select name="swapPlayerId">
                <option selected></option>
                ${availablePlayersToSwap.map(x => html`<option value="${x.playerId}">${x.name}</option>`) }
            </select>
        </form>`)}
        <form method=post action="?$${queryTeamGame}&playerId=$${x.playerId}&handler=addPlayerPosition" onchange="this.submit()">
            <input
                type=search
                name=position
                list=positions
                autocomplete=off
                placeholder="Position" >
        </form>
        <p>${formatTime(x.total)}</p>
    </li>
        `
    })}
</ul>

<h3>Not Playing</h3>

${when(!notPlaying, html`<p>All players will be playing the game!</p>`)}

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


<datalist id=activities>
    ${activities.map(x => html`<option value="${x.name}"`)}
</datalist>
<datalist id=positions>
    ${positions.map(x => html`<option value="${x.name}">`)}
</datalist>
    `
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

const dataPositionValidator = {
    position: createString25("Position")
}

const dataPositionIdValidator = {
    positionId: createIdNumber("Position")
}

async function swap({ teamId, playerIds, gameId, timestamp } : { teamId : number, playerIds: number[], gameId: number, timestamp: number }) {
    let [team, players] = await Promise.all([teamGet(teamId), playerGameAllGet(teamId, gameId, playerIds)])
    let game = await required(team.games.find(x => x.id === gameId), "Could not find game ID!")
    for (let player of players) {
        let [gameTime] = player.gameTime.slice(-1)
        if (player.status?._ === "onDeck" && player.status.playerId) {
            let [swapPlayer] = await playerGameAllGet(teamId, gameId, [player.status.playerId])
            let swapGameTime = swapPlayer.gameTime.slice(-1)[0]
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

const postHandlers : PostHandlers = {
    pointsInc: setPoints(game => ++game.points),
    pointsDec: setPoints(game => --game.points),
    oPointsDec: setPoints(game => --game.opponentPoints),
    oPointsInc: setPoints(game => ++game.opponentPoints),

    addPlayerPosition: async ({ data, query }) => {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        await cache.push({ posted: `player:${playerId}` })
        let { position } = await validateObject(data, dataPositionValidator)
        let positionObj = await positionCreateOrGet(teamId, position)
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
        p.gameTime.slice(-1)[0].end = +new Date()
        await playerGameSave(teamId, p)
    },

    onDeckWith: async ({ query, data }) => {
        let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator)
        let { swapPlayerId } = await validateObject(data, { swapPlayerId: createIdNumber("Swap Player Id") })
        await cache.push({ posted: `player:${playerId}` })
        let [player, swapPlayer] = await playerGameAllGet(teamId, gameId, [playerId, swapPlayerId])
        player.status = { _: "onDeck", playerId: swapPlayer.playerId }
        let gameTime = player.gameTime.slice(-1)[0]
        if (!gameTime || gameTime.end) {
            gameTime = {
                positionId: swapPlayer.gameTime.slice(-1)[0].positionId
            }
            player.gameTime.push(gameTime)
        } else {
            gameTime.positionId = swapPlayer.gameTime.slice(-1)[0].positionId
        }
        await playerGameSave(teamId, player)
    },

    swapAll: async ({ query }) => {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        await cache.push({ posted: "swap-all" })
        let team = await teamGet(teamId)
        let players = await playerGameAllGet(teamId, gameId, team.players.map(x => x.playerId))
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

        let players = await playerGameAllGet(teamId, gameId, team.players.map(x => x.playerId))
        let inPlayPlayers = players.filter(x => x.status?._ === "inPlay")
        for (let player of inPlayPlayers) {
            let gameTime = player.gameTime.find(x => !x.start)
            if (gameTime) {
                gameTime.start = timestamp
            } else {
                player.gameTime.push({
                    positionId: player.gameTime.slice(-1)[0].positionId,
                    start: timestamp
                })
            }
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
        let time = game.gameTime.find(x => !x.end)
        if (time) {
            time.end = timestamp
        }
        await teamSave(team)

        let players = await playerGameAllGet(teamId, gameId, team.players.map(x => x.playerId))
        let inPlayPlayers = players.filter(x => x.status?._ === "inPlay")
        for (let player of inPlayPlayers) {
            let gameTime = player.gameTime.find(x => !x.end)
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
        player.gameTime.slice(-1)[0].end = timestamp
        player.gameTime.push({
            positionId,
            start: timestamp,
        })
        await playerGameSave(teamId, player)
        return html``
    },

}

const route : Route = {
    route: (url: URL) => url.pathname.endsWith("/games/") && url.searchParams.has("gameId") && url.searchParams.has("teamId"),
    async get(req: Request) {
        const result = await start(req)
        const template = await layout(req)
        return template({ main: render(result), head: `<script src= "/web/js/game-timer.js"></script>`, scripts: ["/web/js/lib/request-submit.js", "/web/js/lib/htmf.js"] })
    },
    post: handlePost(postHandlers),
}

export default route
