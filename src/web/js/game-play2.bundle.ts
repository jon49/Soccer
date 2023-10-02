import { html, r } from "@arrow-js/core"
import { GamePlayView } from "../pages/games2/game-play.html.js"
import { when } from "../server/shared.js"
import { GameTimeCalculator } from "../pages/games/shared.js"

const data = <GamePlayView>JSON.parse(getById("data")?.innerHTML ?? "{}")

let game = r(data.game)
let gameCalc = new GameTimeCalculator(data.game)

const call =
    (handler: string) =>
        fetch(`?gameId=${game.id}&teamId=${data.team.id}&handler=${handler}`, { method: "POST" })
        .then(x => x.json())

const api = {
    toggleGamePlay: () =>
        call("toggleGamePlay")
        .then(x => game.status = <any>x.status),
    toggleEndOfGame: () =>
        call("toggleEndOfGame")
        .then(x => game.status = <any>x.status),
    incrementPoints:
        (team: "us" | "them") =>
        () =>
        call(`${team}Inc`)
        .then(x => team === "us" ? game.points = x.points : game.opponentPoints = x.opponentPoints),
    decrementPoints: (team: "us" | "them") =>
        () =>
        call(`${team}Dec`)
        .then(x => team === "us" ? game.points = x.points : game.opponentPoints = x.opponentPoints),
}

let gameStatsTemplate = html`
    ${() => when(game.status !== "ended",
         () => html`<button @click="${api.toggleGamePlay}">
            ${game.status === "play" ? "Pause" : "Start"}</button>`)}

    <game-timer
        ${() => when(game.status === "paused", () => `data-flash data-start="${gameCalc.getLastEndTime()}"`)}
        ${() => when(game.status === "play", `data-start="${gameCalc.getLastStartTime()}" data-total="${gameCalc.total()}"`)}
        data-static="${() => game.status === "ended"}" >
    </game-timer>

    ${() => when(game.status !== undefined, () =>
         html`<button @click="${api.toggleEndOfGame}">
            ${() => game.status === "ended" ? "Restart" : "End"}</button>`
        )}
    
    <ul class="list">
        <li>
            <span>Points</span>
            <button @click="${api.decrementPoints("us")}">-</button>
            <span>&nbsp;${() => game.points}&nbsp;</span>
            <button @click="${api.incrementPoints("us")}">+</button>
        </li>
        <li>
            <span>Opponent</span>
            <button @click="${api.decrementPoints("them")}">-</button>
            <span>&nbsp;${() => game.opponentPoints}&nbsp;</span>
            <button @click="${api.incrementPoints("them")}">+</button>
        </li>
    </ul>
    `


const gameStatsElement = getById("game-stats")
if (gameStatsElement) {
    gameStatsTemplate(gameStatsElement)
}

function getById(id: string) {
    return document.getElementById(id)
}



