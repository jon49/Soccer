import { Activity, Game, GameTime, PlayerGame, Position, Team } from "../js/db"
import html from "../js/html-template-tag"
import { activityGetAll, playerGameAllGet, positionGetAll } from "../js/repo-player-game"
import { teamGet } from "../js/repo-team"
import { Route } from "../js/route"
import { when } from "../js/shared"
import { searchParams } from "../js/utils"
import { required, validateObject } from "../js/validation"
import { QueryTeam, queryTeamGameValidator } from "../js/validators"
import layout from "../_layout.html"

interface PlayerGameView {
    team: Team
    playersGame: PlayerGame[]
    game: Game
    positions: Position[]
    activities: Activity[]
}

async function start(req : Request) : Promise<PlayerGameView> {
    let { team: teamId, game: gameId_ } = await validateObject(<QueryTeam>searchParams<QueryTeam>(req), queryTeamGameValidator)
    let gameId = +gameId_
    let team = await teamGet(teamId)
    let game = await required(team.games.find(x => x.id === gameId), "Could not find game ID!")
    let playersGame = await playerGameAllGet(+gameId, team.players.map(x => x.name))
    let positions = await positionGetAll(+teamId)
    let activities = await activityGetAll(+teamId)

    return {
        team,
        playersGame,
        game,
        positions,
        activities,
    }
}

function getPositionName(positions: Position[], gameTime: GameTime[]) {
    return positions.find(y => y.id === gameTime.find(x => !x.end)?.position)?.name
}

function render({ team, playersGame, game, positions, activities }: PlayerGameView) {
    let queryTeamGame = html`team=${team.id}&game=${game.id}`
    let inPlayPlayers = playersGame.filter(x => x.status?._ === "inPlay")
    let inPlay = inPlayPlayers.length > 0
    let onDeck = playersGame.filter(x => x.status?._ === "onDeck").length > 0
    let out = playersGame.filter(x => x.status?._ === "out").length > 0
    return html`
<h2>Game ${game.date} ${when(game.opponent, x => ` - ${x}`)}</h2>
<div>
    <form class=inline method=post action="?${queryTeamGame}&handler=${game.status === "play" ? "pauseGame" : "startGame"}">
        <button>${game.status === "play" ? "Pause" : "Start"}</button>
    </form>
    <span>Points</span>
    <form class=inline method=post>
        <button formaction="?${queryTeamGame}&handler=pointsDec" target="#points">-</button>
        <span id=points>&nbsp;${game.points || "0"}&nbsp;</span>
        <button formaction="?${queryTeamGame}&handler=pointsInc" target="#points">+</button>
    </form>
    <span>Opponent</span>
    <form class=inline method=post>
        <button formaction="?${queryTeamGame}&handler=oPointsDec" target="#o-points">-</button>
        <span id=o-points>&nbsp;${game.opponentPoints || "0"}&nbsp;</span>
        <button formaction="?${queryTeamGame}&handler=oPointsInc" target="#o-points">+</button>
    </form>
</div>

<h3>In-Play</h3>
${when(!inPlay, html`<p>No players are in play.</p>`)}
<ul class=list>
    ${playersGame.filter(x => x.status?._ === "inPlay").map((x, i) => html`
    <li>
        <span>${x.name}</span>
        <form method=post action="?${queryTeamGame}&player=${encodeURIComponent(x.name)}&handler=positionChange">
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
            action="?${queryTeamGame}&player=${encodeURIComponent(x.name)}&handler=activityMarker"
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
    ${playersGame.filter(x => x.status?._ === "onDeck").map((x, i) => {
       let playerEnc = encodeURIComponent(x.name)
       let inPlayName = <string>(x.status?._ === "onDeck" ? x.status.player : null)
       let position = playersGame.find(x => x.name === inPlayName)
       return html`
    <li>
        <form method=post action"?${queryTeamGame}&player=${playerEnc}&handler=swap">
            <button>Swap</button>
        </form>
        <form method=post action="?${queryTeamGame}&player=${playerEnc}&handler=cancelOnDeck">
            <button class=danger>X</button>
        </form>
        <span>${x.name} (${inPlayName} ${when(position?.gameTime?.find(x => !x.end)?.position, x => `- ${x}`)})</span>
    </li>
    `})}
</ul>

<form method=post action="?${queryTeamGame}&handler=swapAll">
    <button>Swap All</button>
</form>

<h3>Out</h3>

${when(!out, html`<p>No players are currently out.</p>`)}

<ul class=list>
    ${playersGame.filter(x => !x.status || x.status._ === "out").map(x => {
       let playerEnc = encodeURIComponent(x.name)
        return html`
    <li>
        <form method=post action="?${queryTeamGame}&player=${playerEnc}&handler=noShow">
            <button>X</button>
        </form>
        <p>${x.name}</p>
        <form method=post action="?${queryTeamGame}&player=${playerEnc}&handler=addPlayerPosition">
            <input
                type=search
                name=position
                list=positions
                autocomplete=off
                placeholder="Add player to on deck"
                onchange="hf.click(this)" >
        </form>
        ${when(inPlay, _ =>
            html`
        <form method=post action="?${queryTeamGame}&player=${playerEnc}&handler=onDeckWith">
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

const route : Route = {
    route: (url: URL) => url.pathname.endsWith("/games/") && url.searchParams.has("game") && url.searchParams.has("team"),
    async get(req: Request) {
        const result = await start(req)
        const template = await layout(req)
        return template({ main: render(result), script: "/web/js/lib/htmf-all.min.js" })
    },
    // post: handlePost(postHandlers),
}

export default route
