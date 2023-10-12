import html from "html-template-tag-stream"
import { PostHandlers, Route } from "../../server/route.js"
import layout from "../_layout.html.js"
import { when } from "../../server/html.js"
import { queryTeamIdGameIdValidator } from "../../server/validators.js"
import { validateObject } from "promise-validation"
import { saveGameNotes, teamGet, teamSave } from "../../server/repo-team.js"
import { createIdNumber, createPositiveWholeNumber, createStringInfinity, required } from "../../server/validation.js"
import { Game, PlayerGame } from "../../server/db.js"
import { playerGameAllGet, playerGameSave } from "../../server/repo-player-game.js"
import { GameTimeCalculator, PlayerGameTimeCalculator, PlayerStateView, filterInPlayPlayers, filterOnDeckPlayers } from "./shared.js"
import { inPlayPlayersView } from "./_in-play-players-view.js"

function getPointsView(points: number) {
    return html`&nbsp;${points || "0"}&nbsp;`
}

async function render(req: Request) {
    let o = await PlayerStateView.create(req)
    let notes = await o.notes()
    let game = await o.game()
    let queryTeamGame = o.queryTeamGame
    let gameCalc = await o.gameCalc()

    let isGameInPlay = await o.isGameInPlay()
    let isGameEnded = await o.isGameEnded()
    let isGamePaused = await o.isGamePaused()

    return html`
<h2>Game Play — ${game.home ? "Home" : "Away"} — ${game.opponent}</h2>

<div id=root>
    ${when(!isGameEnded, () => html`
    <form class=inline method=post action="?$${queryTeamGame}&handler=${isGameInPlay ? "pauseGame" : "startGame"}">
        <button>${isGameInPlay ? "Pause" : "Start"}</button>
    </form>`)}

    <game-timer
        $${when(isGamePaused, () => `data-flash data-start="${gameCalc.getLastEndTime()}"`)}
        $${when(isGameInPlay, `data-start="${gameCalc.getLastStartTime()}" data-total="${gameCalc.total()}"`)}
        $${when(isGameEnded, `data-static`)}>
    </game-timer>

    <form class=inline method=post action="?$${queryTeamGame}&handler=${isGameEnded ? "restartGame" : "endGame"}">
        <button>${isGameEnded ? "Restart" : "End"}</button>
    </form>

    <ul class=list>
        <li>
            <span>Points</span>
            <form id=team-points class=inline method=post hf-target="#points" hidden></form>
            <button formaction="?$${queryTeamGame}&handler=pointsDec" form=team-points>-</button>
            <span id=points>${getPointsView(game.points)}</span>
            <button formaction="?$${queryTeamGame}&handler=pointsInc" form=team-points>+</button>
        </li>
        <li>
            <span>Opponent</span>
            <form id=opponent-points class=inline method=post hf-target="#o-points" hidden></form>
            <button formaction="?$${queryTeamGame}&handler=oPointsDec" form=opponent-points>-</button>
            <span id=o-points>${getPointsView(game.opponentPoints)}</span>
            <button formaction="?$${queryTeamGame}&handler=oPointsInc" form=opponent-points>+</button>
        </li>
    </ul>
</div>

<div id="player-state">${playerState(o)}</div>

<h3>Notes</h3>

<form method=post action="?${queryTeamGame}&handler=updateNote" onchange="this.requestSubmit()">
    <elastic-textarea>
        <textarea name=notes>${notes}</textarea>
    </elastic-textarea>
</form>
`
}

async function playerState(o: PlayerStateView) {
    let { positions } = await o.positions()

    let inPlayPlayers = await o.inPlayPlayers()

    let onDeckPlayers = await o.onDeckPlayers()
    let onDeck = await o.playersOnDeck()

    let notPlayingPlayers = await o.notPlayingPlayers()
    let notPlaying = await o.playersNotPlaying()

    let queryTeamGame = o.queryTeamGame

    return html`
<h3 id=in-play-players>In-Play</h3>

${inPlayPlayersView(o)}

${when(onDeck, () => html`
<h3>On Deck</h3>

<ul mpa-miss="#root" class=list>
    ${onDeckPlayers.map(x => {
        let currentPlayer = inPlayPlayers.find(y => y.playerId === x.status.currentPlayerId)
        return html`
    <li>
        <form method=post action="?$${queryTeamGame}&playerId=${x.playerId}&handler=swap">
            <button>Swap</button>
        </form>
        <form method=post action="?$${queryTeamGame}&playerId=${x.playerId}&handler=cancelOnDeck">
            <button class=danger>X</button>
        </form>
        <span>${x.name} - ${positions[x.status.targetPosition]}${when(currentPlayer, c => html` (${c.name})`)}</span>
    </li>
    `})}
</ul>`)}

${when(onDeckPlayers.length, () => html`
<form method=post action="?$${queryTeamGame}&handler=swapAll">
    <button>Swap All</button>
</form>`)}

<div id=out-players> ${outPlayersView(o)} </div>

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

async function outPlayersView(o: PlayerStateView) {
    let out = await o.playersOut()
    if (!out) return html``

    let outPlayers = await o.outPlayers()
    let queryTeamGame = o.queryTeamGame

    return html`
<h3>Out</h3>

<ul id=out-players class=list mpa-miss="#out-players">

    ${outPlayers.map(x => html`
<li>
    <form method=post action="?$${queryTeamGame}&playerId=$${x.playerId}&handler=notPlaying">
        <button>X</button>
    </form>
    <a href="?$${queryTeamGame}&playerId=${x.playerId}&handler=placePlayerOnDeck&playerSwap#game-swap-top">${x.name}</a>
    <game-timer data-total="${x.calc.total()}" data-static></game-timer>
</li>`)}

</ul>`
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

    playerNowOut: async ({ query }) => {
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

    startGame: async ({ query }) => {
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
    },

    pauseGame: async ({ query }) => {
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
    },

    endGame: async ({ query }) => {
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
            main: (await render(req)),
            scripts: ["/web/js/lib/elastic-textarea.js"],
            title: "Game Play",
            useHtmf: true,
        })
    },
    post: postHandlers,
}

export default route

