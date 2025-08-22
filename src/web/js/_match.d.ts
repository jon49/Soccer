export interface AllPlayers {
    inPlayers: []
    onDeckPlayersReady: []
    onDeckPlayersUnknown: [] 
}

export interface GameCalc {
    lastEndTime: number
}

export type GameState = "paused" | "playing" | "ended"

