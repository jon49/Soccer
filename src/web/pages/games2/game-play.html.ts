import html from "html-template-tag-stream"
import { PostHandlers, Route } from "../../server/route.js"
import layout from "../_layout.html.js"
import { when } from "../../server/html.js"
import { queryTeamIdGameIdValidator } from "../../server/validators.js"
import { validateObject } from "promise-validation"
import { searchParams } from "../../server/utils.js"
import { getGameNotes, saveGameNotes, teamGet, teamSave } from "../../server/repo-team.js"
import { createIdNumber, createPositiveWholeNumber, createStringInfinity, required } from "../../server/validation.js"
import { Game, NotPlayingPlayer, OutPlayer, PlayerGame, PlayerGameStatus, Team } from "../../server/db.js"
import { playerGameAllGet, playerGameSave, positionGetAll } from "../../server/repo-player-game.js"
import { GameTimeCalculator, PlayerGameTimeCalculator, createPlayersView, filterInPlayPlayers, filterOnDeckPlayers } from "./shared.js"

function filterOutPlayers(x: PlayerGame) : x is PlayerGameStatus<OutPlayer> {
    return !x.status || x.status?._ === "out"
}

function filterNotPlayingPlayers(x: PlayerGame) : x is PlayerGameStatus<NotPlayingPlayer> {
    return x.status?._ === "notPlaying"
}

export interface GamePlayView {
    game: Game
    team: Team
}

async function render(req: Request) {
    let { teamId, gameId } = await validateObject(searchParams(req), queryTeamIdGameIdValidator)
    let team = await teamGet(teamId)
    team.players = team.players.filter(x => x.active)
    let game = await required(team.games.find(x => x.id === gameId), "Could not find game ID!")
    let queryTeamGame = `teamId=${team.id}&gameId=${game.id}`
    let gameCalc = new GameTimeCalculator(game)

    let isInPlay = game.status === "play"

    let [ players, { grid, positions }, { notes } ] = await Promise.all([
        playerGameAllGet(teamId, gameId, team.players.map(x => x.id)),
        positionGetAll(teamId),
        getGameNotes(teamId, gameId)
    ])

    let inPlayPlayers = await createPlayersView(filterInPlayPlayers, team.players, players)
    let inPlay = inPlayPlayers.length > 0

    let onDeckPlayers = await createPlayersView(filterOnDeckPlayers, team.players, players)
    let onDeck = onDeckPlayers.length > 0

    let outPlayers = await createPlayersView(filterOutPlayers, team.players, players)
    let out = outPlayers.length > 0
    outPlayers.sort((a, b) => a.calc.total() - b.calc.total())

    let notPlayingPlayers = await createPlayersView(filterNotPlayingPlayers, team.players, players)
    let notPlaying = notPlayingPlayers.length > 0

    return html`
<h2>${game.home ? "Home" : "Away"} — ${game.opponent}</h2>

<script type="application/json" id="data">$${JSON.stringify({ team, game })}</script>

<div id=game-stats></div>

<script type="module" src="/web/js/game-play2.bundle.js"></script>

<h3>In-Play</h3>

${when(!inPlay, () => html`<p>No players are in play.</p>`)}
${when(inPlayPlayers.length, function* positionViews() {
    let count = 0
    for (let width of grid) {
        yield html`<div class="row grid-center">`
        let p = positions.slice(count, count + width)
        if (p.length < width) {
            p = p.concat(new Array(width - p.length).fill("None"))
        }
        yield p.map(() => {
            let player = inPlayPlayers.find(x => count === x.status.position)
            let sub = player && onDeckPlayers.find(x => x.status.currentPlayerId === player?.playerId)
            let view = html`<form method=post>${
            () => {
                return player
                    ? html`
                <game-shader data-total="${gameCalc.currentTotal()}" data-value="${player.calc.currentTotal()}">
                    <div>
                        ${when(sub, sub => html`<span>${player?.name} (${sub.name})</span>`)}
                        ${when(!sub, () => html`<a href="?$${queryTeamGame}&playerId=${player?.playerId}&handler=placePlayerOnDeck&playerSwap#game-swap-top">${player?.name}</a>`)}
                        <game-timer data-start="${player.calc.getLastStartTime()}" data-total="${player.calc.total()}" ${when(!isInPlay, "data-static")}></game-timer>
                        <button formaction="?${queryTeamGame}&playerId=${player.playerId}&handler=playerNowOut">X</button>
                    </div>
                </game-shader>
                    `
                : html`<span></span>`
            }
            }</form>`
            count++
            return view
        })
        yield html`</div>`
    }
})}

${when(onDeck, () => html`
<h3>On Deck</h3>

<ul id=on-deck-players class=list>
    ${onDeckPlayers.map(x => {
        let currentPlayer = inPlayPlayers.find(y => y.playerId === x.status.currentPlayerId)
        return html`
    <li>
        <form method=post action="?$${queryTeamGame}&playerId=$${x.playerId}&handler=swap">
            <button>Swap</button>
        </form>
        <form method=post action="?$${queryTeamGame}&playerId=$${x.playerId}&handler=cancelOnDeck">
            <button class=danger>X</button>
        </form>
        <span>${x.name} - ${positions[x.status.targetPosition]}${when(currentPlayer, c => html` (${c.name})`)}</span>
    </li>
    `})}
</ul>`)}

${when(onDeckPlayers.length > 1, () => html`
<form method=post action="?$${queryTeamGame}&handler=swapAll">
    <button>Swap All</button>
</form>`)}

${when(out, () => html`
<h3>Out</h3>

<ul id=out-players class=list mpa-miss="#out-players">
    ${outPlayers.map(x => {
        return html`
<li>
    <form method=post action="?$${queryTeamGame}&playerId=$${x.playerId}&handler=notPlaying">
        <button>X</button>
    </form>
    <a href="?$${queryTeamGame}&playerId=${x.playerId}&handler=placePlayerOnDeck&playerSwap#game-swap-top">${x.name}</a>
    <game-timer data-total="${x.calc.total()}" data-static></game-timer>
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

<h3>Notes</h3>

<form method=post action="?${queryTeamGame}&handler=updateNote" onchange="this.submit()">
    <elastic-textarea>
        <textarea name=notes>${notes}</textarea>
    </elastic-textarea>
</form>

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

function jsonResponse(data : any) {
    return new Response(JSON.stringify(data), {
        headers: {
            "Content-Type": "application/json"
        }
    })
}

function setPoints(f: (game: Game) => number) {
    return async ({ query } : { query: any }) => {
        let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator)
        let team = await teamGet(teamId)
        let game = await required(team.games.find(x => x.id === gameId), "Could not find game!")
        let points = f(game)
        if (points >= 0) {
            await teamSave(team)
        }
        return jsonResponse(game)
    }
}

const dataNotesValidator = {
    notes: createStringInfinity("Notes")
}

const postHandlers : PostHandlers = {
    usInc: setPoints(game => ++game.points),
    usDec: setPoints(game => --game.points),
    themInc: setPoints(game => ++game.opponentPoints),
    themDec: setPoints(game => --game.opponentPoints),

    updateNote: async ({ query, data }) => {
        let { gameId, teamId } = await validateObject(query, queryTeamIdGameIdValidator)
        let { notes } = await validateObject(data, dataNotesValidator)
        await saveGameNotes(teamId, gameId, notes)
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
        return { game, players }
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
        return { game, players }
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

    toggleGamePlay: async (req) => {
        let { teamId, gameId } = await validateObject(req.query, queryTeamIdGameIdValidator)
        let team = await teamGet(teamId)
        let game = await required(team.games.find(x => x.id === gameId), `Could not find game! ${gameId}`)
        let result : { game: Game, players: PlayerGame[] }
        if (game.status === "paused" || game.status === undefined) {
            result = await postHandlers.startGame(req)
        } else {
            result = await postHandlers.pauseGame(req)
        }
        return jsonResponse(result.game)
    }

}

const route : Route = {
    route: (url: URL) =>
        url.pathname.endsWith("/games2/")
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
            bodyAttr: `mpa-persist mpa-page-name="game"`,
            main: (await render(req)),
            scripts: ["/web/js/lib/elastic-textarea.js"],
            title: "Game Play" })
    },
    post: postHandlers,
}

export default route

