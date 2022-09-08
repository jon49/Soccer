import { Activity, cache, Game, GameTime, Message, PlayerGame, Position, Team } from "../server/db"
import html from "../server/html-template-tag"
import { activityGetAll, playerGameAllGet, playerGameSave, positionCreateOrGet, positionGetAll } from "../server/repo-player-game"
import { teamGet, teamSave } from "../server/repo-team"
import { Route, PostHandlers, handlePost } from "../server/route"
import { messageView, when } from "../server/shared"
import { searchParams, sort } from "../server/utils"
import { createIdNumber, createString25, required, validateObject } from "../server/validation"
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
    let timerStarted = game.status === "play"
    return html`
<h2>${team.name} - Game ${game.date} ${when(game.opponent, x => ` - ${x}`)}</h2>
<div>
    <form class=inline method=post action="?$${queryTeamGame}&handler=${game.status === "play" ? "pauseGame" : "startGame"}">
        <button>${game.status === "play" ? "Pause" : "Start"}</button>
    </form>
    <game-timer
        $${when(!timerStarted, `data-timer-flash data-timer-start="${tail(game.gameTime)?.end}"`)}
        $${when(timerStarted, () => `data-timer-start="${start}" data-timer-total="${total}"`)}
        ></game-timer>
    <div class=inline>
        <span>Points</span>
        <form class=inline method=post>
            <button formaction="?$${queryTeamGame}&handler=pointsDec" target="#points">-</button>
            <span id=points>&nbsp;${getPointsView(game.points)}&nbsp;</span>
            <button formaction="?$${queryTeamGame}&handler=pointsInc" target="#points">+</button>
        </form>
    </div>
    <div class=inline>
        <span>Opponent</span>
        <form class=inline method=post>
            <button formaction="?$${queryTeamGame}&handler=oPointsDec" target="#o-points">-</button>
            <span id=o-points>&nbsp;${getPointsView(game.opponentPoints)}&nbsp;</span>
            <button formaction="?$${queryTeamGame}&handler=oPointsInc" target="#o-points">+</button>
        </form>
    </div>
</div>

<h3>In-Play</h3>
${when(!inPlay, html`<p>No players are in play.</p>`)}
<ul class=list>
    ${inPlayPlayers.map((x, i) => {
        let baseQuery : string = `${queryTeamGame}&playerId=${x.playerId}`
        let positionId = tail(x.gameTime).positionId
        let position = positions.find(x => x.id === positionId)?.name
        let playerInfoId = `in-play-${x.playerId}`
        return html`
    <li>
        <form method=post action="?$${baseQuery}&handler=playerNowOut" >
            <button>X</button>
        </form>
        <details>
            <summary>
                <span id=${playerInfoId}>${inPlayPlayerInfoView(x.name, position)}</span>
                ${when(timerStarted, () =>
                    html`<game-timer data-timer-start=${x.start} data-timer-total=${x.total}></game-timer>`)}
            </summary>

            <form
                target=#${playerInfoId}
                method=post
                action="?$${baseQuery}&handler=positionChange"
                onchange="this.requestSubmit()">
                <select name=positionId>
                    ${positions.map(position => html`
                    <option value="${position.id}" ${when(position.id === tail(x.gameTime).positionId, "selected")}>${position.name}</option>`)}
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
        </details>
    </li>
    `})}
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

${when(onDeck, () => html`
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
        <form class=disappearing method=post action="?$${queryTeamGame}&playerId=$${x.playerId}&handler=onDeckWith" onchange="this.submit()">
            <label class=pointer for=swap-player-id${x.playerId}>🏃</label>
            <select id=swap-player-id${x.playerId} name="swapPlayerId">
                <option selected></option>
                ${availablePlayersToSwap.map(x => html`<option value="${x.playerId}">${x.name}</option>`) }
            </select>
        </form>`)}
        <form class=disappearing method=post action="?$${queryTeamGame}&playerId=$${x.playerId}&handler=addPlayerPosition" onchange="this.submit()">
            <label class=pointer for=position-select${x.playerId}>#</label>
            <input
                id=position-select${x.playerId}
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
        let [p, positions] = await Promise.all([teamGet(teamId), positionGetAll(teamId)])
        let position = positions.positions.find(x => x.id === positionId)
        return inPlayPlayerInfoView(p.players.find(x => x.id === playerId)?.name, position?.name)
    },

}

const route : Route = {
    route: (url: URL) => url.pathname.endsWith("/games/") && url.searchParams.has("gameId") && url.searchParams.has("teamId"),
    async get(req: Request) {
        let result = await start(req)
        let template = await layout()
        let head = `
            <style>
                summary {
                    cursor: pointer;
                    list-style: none;
                }
                summary::before {
                    content: '\u2699';
                    font-weight: 900;
                }
                .disappearing:focus-within > label {
                    display: none;
                }
                .disappearing > select, .disappearing > input {
                    position: absolute;
                    left: -1000px;
                }
                .disappearing > select:focus, .disappearing > input:focus {
                    position: inherit;
                }
                .pointer {
                    cursor: pointer;
                }
            </style>
            <script src= "/web/js/game-timer.js"></script>
        `
        return template({ main: render(result), head, scripts: ["/web/js/lib/request-submit.js", "/web/js/lib/htmf.js"] })
    },
    post: handlePost(postHandlers),
}

export default route
