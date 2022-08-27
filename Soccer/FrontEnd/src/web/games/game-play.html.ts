import { Activity, Game, GameTime, PlayerGame, Position, Team } from "../js/db"
import html from "../js/html-template-tag"
import { activityGetAll, playerGameAllGet, playerGameSave, positionCreateOrGet, positionGetAll } from "../js/repo-player-game"
import { teamGet, teamSave } from "../js/repo-team"
import { Route, PostHandlers, handlePost } from "../js/route"
import { when } from "../js/shared"
import { searchParams } from "../js/utils"
import { createIdNumber, createString25, required, validate, validateObject } from "../js/validation"
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
}

async function start(req : Request) : Promise<View> {
    let { teamId, gameId } = await validateObject(searchParams(req), queryTeamIdGameIdValidator)
    let team = await teamGet(teamId)
    let game = await required(team.games.find(x => x.id === gameId), "Could not find game ID!")
    let [playersGame, positions, activities] = await Promise.all([
        playerGameAllGet(gameId, team.players.map(x => x.playerId)),
        positionGetAll(teamId),
        activityGetAll(teamId),
    ])

    let playersGameView : PlayerGameView[] = playersGame.map(x => ({
        ...x,
        name: team.players.find(x => x.playerId === x.playerId)?.name ?? ""
    }))

    return {
        team,
        playersGame: playersGameView,
        game,
        positions,
        activities,
    }
}

function getPositionName(positions: Position[], gameTime: GameTime[]) {
    return positions.find(y => y.id === gameTime.find(x => !x.end)?.positionId)?.name
}

const filterOutPlayers = (x: PlayerGameView) => !x.status || x.status?._ === "out"
const filterInPlayPlayers = (x: PlayerGameView) => x.status?._ === "inPlay"
const filterOnDeckPlayers = (x: PlayerGameView) => x.status?._ === "onDeck"

function render({ team, playersGame, game, positions, activities }: View) {
    let queryTeamGame = `teamId=${team.id}&gameId=${game.id}`
    let inPlayPlayers = playersGame.filter(filterInPlayPlayers)
    let inPlay = inPlayPlayers.length > 0
    let onDeck = playersGame.filter(filterOnDeckPlayers).length > 0
    let out = playersGame.filter(filterOutPlayers).length > 0
    return html`
<h2>${team.name} - Game ${game.date} ${when(game.opponent, x => ` - ${x}`)}</h2>
<div>
    <form class=inline method=post action="?$${queryTeamGame}&handler=${game.status === "play" ? "pauseGame" : "startGame"}">
        <button>${game.status === "play" ? "Pause" : "Start"}</button>
    </form>
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
    ${playersGame.filter(filterInPlayPlayers).map((x, i) => html`
    <li>
        <span>${x.name}</span>
        <form method=post action="?$${queryTeamGame}&playerId=${x.playerId}&handler=positionChange">
            <input
                type=search
                name=position
                list=positions
                autocomplete=off
                ${when(getPositionName(positions, x.gameTime), x => html`value=${x}`)}
                placeholder="Add a position"
                onchange="hf.click(this)" >
            <button hidden></button>
        </form>
        <form
            method=post
            action="?$${queryTeamGame}&playerId=${encodeURIComponent(x.name)}&handler=activityMarker"
            target="in-play-activity-${i}"
            >
            <input
                id=in-play-activity-${i}
                type=search
                name=activity
                list=activities
                autocomplete=off
                placeholder="Mark an activity"
                onchange="hf.click(this)"
                >
            <button hidden></button>
        </form>
        <p
            data-action-timer=${x.gameTime.find(x => !x.end)?.start}
            data-action-timer-start=${x.gameTime.reduce((acc, { end, start }) =>
                end && start ? acc + (end - start) : acc
                , 0)}></p>
    </li>
    `)}
</ul>

<h3>On Deck</h3>

${when(!onDeck, html`<p>No players are on deck.</p>`)}

<ul class=list>
    ${playersGame.filter(filterOnDeckPlayers).map(x => {
       let inPlayName = <string>(x.status?._ === "onDeck" ? x.status.player : null)
       let position = playersGame.find(x => x.name === inPlayName)
       return html`
    <li>
        <form method=post action"?$${queryTeamGame}&playerId=$${x.playerId}&handler=swap">
            <button>Swap</button>
        </form>
        <form method=post action="?$${queryTeamGame}&playerId=$${x.playerId}&handler=cancelOnDeck">
            <button class=danger>X</button>
        </form>
        <span>${x.name} (${inPlayName} ${when(position?.gameTime?.find(x => !x.end)?.positionId, x => `- ${x}`)})</span>
    </li>
    `})}
</ul>

<form method=post action="?$${queryTeamGame}&handler=swapAll">
    <button>Swap All</button>
</form>

<h3>Out</h3>

${when(!out, html`<p>No players are currently out.</p>`)}

<ul class=list>
    ${playersGame.filter(filterOutPlayers).map(x => {
        return html`
    <li>
        <form method=post action="?$${queryTeamGame}&playerId=$${x.playerId}&handler=notPlaying">
            <button>X</button>
        </form>
        <p>${x.name}</p>
        <form method=post action="?$${queryTeamGame}&playerId=$${x.playerId}&handler=addPlayerPosition">
            <input
                type=search
                name=positionId
                list=positions
                autocomplete=off
                placeholder="Position"
                onchange="hf.click(this)" >
        </form>
        ${when(inPlay, _ =>
            html`
        <form method=post action="?$${queryTeamGame}&playerId=$${x.playerId}&handler=onDeckWith">
            <select>
                ${inPlayPlayers.map(x => html`
                    <option>${x.name}</option>`) }
            </select>
        </form>`)}
    </li>
        `
    })}
</ul>

<datalist id=activities>
    ${activities.map(x => html`<option value=${x.name}`)}
</datalist>
<datalist id=positions>
    ${positions.map(x => html`<option value=${x.name}>`)}
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

const postHandlers : PostHandlers = {
    pointsInc: setPoints(game => ++game.points),
    pointsDec: setPoints(game => --game.points),
    oPointsDec: setPoints(game => --game.opponentPoints),
    oPointsInc: setPoints(game => ++game.opponentPoints),
    // Not working. Need to do a refactor with the a player ID instead of player name
    addPlayerPosition: async ({ data, query }) => {
        let [{ position }, { gameId, playerId, teamId }] = await validate([
            validateObject(data, dataPositionValidator),
            validateObject(query, queryTeamGamePlayerValidator)
        ])
        let positionObj = await positionCreateOrGet(teamId, position)
        let [p] = await playerGameAllGet(gameId, [playerId])
        p.status = { _: "onDeck" }
        let gameTime = p.gameTime[0]
        if (!gameTime) {
            gameTime = {
                positionId: positionObj.id
            }
            p.gameTime.push(gameTime)
        }
        await playerGameSave(gameId, p, playerId)
    }
}

const route : Route = {
    route: (url: URL) => url.pathname.endsWith("/games/") && url.searchParams.has("gameId") && url.searchParams.has("teamId"),
    async get(req: Request) {
        const result = await start(req)
        const template = await layout(req)
        return template({ main: render(result), script: "/web/js/lib/htmf-all.min.js" })
    },
    post: handlePost(postHandlers),
}

export default route
