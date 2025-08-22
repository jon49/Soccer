// import van from "vanjs-core"
// import { AllPlayers, GameCalc, GameState } from "./_match.js"
// import { click, Timer } from "./_timer.js"

// let { button, div, header, span } = van.tags
// let { derive, state } = van

// class Api {
//     teamId: number
//     gameId: number
//     constructor() {
//         let query = new URLSearchParams(location.search)
//         this.teamId = +(query.get('teamId') ?? 0)
//         this.gameId = +(query.get('gameId') ?? 0)
//     }

//     async swapAll() {
//         return this.post<AllPlayers>('swapAll')
//     }

//     async allOut() {
//         return this.post<AllPlayers>('allOut')
//     }

//     toggleGame(val: GameState) {
//         return this.post<GameState>(val === "paused" ? "startGame" : "pauseGame")
//     }

//     async post<T>(handler: string, body?: any) {
//         return fetch(`/web/match?handler=${handler}&teamId=${this.teamId}&gameId=${this.gameId}`, {
//             method: "post",
//             headers: {
//                 'Accept': 'application/json',
//                 'Content-Type': 'application/json'
//             },
//             body: body ? JSON.stringify(body) : null
//         })
//         .then(x => <T>x.json())
//     }

// }

// let inPlayers = state([])
// let onDeckPlayersReady = state([])
// let onDeckPlayersUnknown = state([])
// let gameState = state<GameState>("paused")
// let gameCalc = state<GameCalc>({ lastEndTime: 0 })
// let currentTime = state(+new Date())

// let areOnDeckPlayersReady = derive(() => onDeckPlayersReady.val.length > 0)
// let gamePaused = derive(() => gameState.val === "paused")
// let gamePlaying = derive(() => gameState.val === "playing")
// let gameEnded = derive(() => gameState.val === "ended")

// let api = new Api()

// click(gameState, currentTime)

// function updatePlayers(players: AllPlayers | void) {
//     if (!players) return
//     inPlayers.val = players.inPlayers
//     onDeckPlayersReady.val = players.onDeckPlayersReady
//     onDeckPlayersUnknown.val = players.onDeckPlayersUnknown
// }

// let $header = () =>
//     div({ class: "flex" },
//         div(
//             button({
//                 hidden: areOnDeckPlayersReady,
//                 onclick: e => {
//                     e.preventDefault()
//                     api.swapAll()
//                     .then(updatePlayers)
//                 }
//             }, "Swap All"),
//             button({
//                 hidden: () => inPlayers.val.length > 0,
//                 onclick: e => {
//                     e.preventDefault()
//                     api.allOut()
//                     .then(updatePlayers)
//                 }
//             }, "All Out")
//         ),
//         div(
//             button({
//                 hidden: gameEnded,
//                 onclick: () => api.toggleGame(gameState.val).then(x => gameState.val = x)
//             }, () => gameState.val === "paused" ? "Start" : "Pause"),
//             // Timer({
//             //     currentTime,
//             //     gameCalc.val.start,
//             //     gameCalc.val.total,
//             //     flash: gamePlaying,
//             // })
//             // ,
//             span({
//                 dataFlash: gamePaused,
//                 dataStart: () => gameCalc.val.lastEndTime,
//             }, "00:00")
//         )
//     );


// // <div>

// //     <span traits="game-timer"
// //         $${when(isGamePaused, () => `data-flash data-start="${gameCalc.getLastEndTime()}"`)}
// //         $${when(isGameInPlay, `data-start="${gameCalc.getLastStartTime()}" data-total="${gameCalc.total()}"`)}
// //         $${when(isGameEnded, `data-static data-total="${gameCalc.total()}"`)}>
// //         00:00
// //     </span>

// //     <button
// //         form=post-form
// //         formaction="/web/match?$${queryTeamGame}&handler=${isGameEnded ? "restartGame" : "endGame"}"
// //         hf-target="#dialogs"
// //         >
// //         ${isGameEnded ? "Restart" : "End"}
// //     </button>
// // </div>

// // <div>
// // <button
// //     form="get-form"
// //     formaction="/web/match?teamId=1&amp;gameId=1&amp;activityId=1&amp;handler=activityPlayerSelector&amp;action=inc"
// //     hf-target="#dialogs"
// //     aria-label="Game points ${gameCalc.game.points}"
// //     >${gameCalc.game.points}</button>
// //     VS
// // <button
// //     form=post-form
// //     formaction="/web/match?$${queryTeamGame}&handler=oPointsInc"
// //     hf-target="this"
// //     aria-label="Opponent points ${gameCalc.game.opponentPoints}"
// //     >${gameCalc.game.opponentPoints}</button>
// // </div>
// // </div>

// let app = () => header("Yes")

// // @ts-ignore
// van.add(window.app, app())
