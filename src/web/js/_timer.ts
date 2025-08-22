import van, { State } from "vanjs-core"
import { GameState } from "./_match.js"

let { span } = van.tags
let { derive } = van

interface TimerArgs {
    start: number
    total: number
    flash?: State<boolean>
    currentTime: State<number>
}

export function click(gameState: State<GameState>, currentTime: State<number>) {
    let interval: null | number = null
    derive(() => {
        if (gameState.val === "playing") {
            interval = setInterval(() => {
                currentTime.val = +new Date()
            }, 1e3)
        } else if (interval) {
            clearInterval(interval)
        }
    })
}

export function Timer({start, total, currentTime, flash}: TimerArgs) {
    let clock = derive(() => formatTime(currentTime.val, start, total))
    return span({ class: () => flash?.val }, clock)
}

function formatTime(currentTime: number, start: number, total: number) {
    let grandTotal = total + (currentTime - start)
    let time = new Date(grandTotal)
    let seconds = (""+time.getSeconds()).padStart(2, "0")
    let minutes = (""+time.getMinutes()).padStart(2, "0")
    let hours = grandTotal/1e3/60/60|0
    return `${ hours ? `${hours}:` : "" }${minutes}:${seconds}`
}
