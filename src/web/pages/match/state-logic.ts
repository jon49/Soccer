import type {
  PlayerGameTime,
  InPlayPlayer,
  OnDeckPlayer,
  PlayerGame,
  PlayerGameStatus,
  OutPlayer,
  NotPlayingPlayer,
  GameTime,
  Game
} from "../../server/db.js"

export function tail<T>(xs: T[]): T {
  return xs.slice(-1)[0]
}

export function isInPlayPlayer(x: PlayerGame): x is PlayerGameStatus<InPlayPlayer> {
  return x.status?._ === "inPlay"
}

export function isOnDeckPlayer(x: PlayerGame): x is PlayerGameStatus<OnDeckPlayer> {
  return x.status?._ === "onDeck"
}

export function isOutPlayer(x: PlayerGame): x is PlayerGameStatus<OutPlayer> {
  return x?.status?._ === "out"
}

export function filterOutPlayers(x: PlayerGame): x is PlayerGameStatus<OutPlayer> {
  return !x.status || x.status?._ === "out"
}

export function filterNotPlayingPlayers(x: PlayerGame): x is PlayerGameStatus<NotPlayingPlayer> {
  return x.status?._ === "notPlaying"
}

export function getTotal(times: { start?: number, end?: number }[]) {
  return times.reduce((acc, { end, start }) =>
    end && start ? acc + end - start : acc
    , 0)
}

export function getCurrentTotal(times: { start?: number, end?: number }[]) {
  let total = getTotal(times)
  let t = tail(times)
  if (t && !t.end && t.start) {
    total += +new Date() - t.start
  }
  return total
}

export class PlayerGameTimeCalculatorBase {
  times: PlayerGameTime[]
  player: PlayerGame
  gameCalc: GameTimeCalculator
  constructor(player: PlayerGame, gameCalc: GameTimeCalculator) {
    this.player = player
    player.gameTime = player.gameTime || []
    this.times = player.gameTime
    this.gameCalc = gameCalc
  }

  start() {
    let time = tail(this.times)
    if (!this.gameCalc.isGameOn()) {
      return
    }
    if (!time || !time.position) {
      return
    }
    if (time.end) {
      return
    }
    time.start = +new Date()
  }

  end(now?: number) {
    let time = tail(this.times)
    if (!time?.start || time?.end) {
      return
    }
    time.end = now || Date.now()
  }

  position(position: string) {
    let time = tail(this.times)
    if (time && !time.end && time.start) {
      this.end()
      this.times.push({
        position
      })
      this.start()
      return
    }
    if (time && !this.hasStarted()) {
      time.position = position
      return
    }
    this.times.push({
      position
    })
  }

  playerOut() {
    if (!this.hasStarted()) {
      this.times.pop()
    } else {
      this.end()
    }
  }

  hasStarted() {
    return !!tail(this.times)?.start
  }

  getLastStartTime() {
    return tail(this.times)?.start
  }

  total() {
    return getTotal(this.times)
  }

  currentTotal() {
    return getCurrentTotal(this.times)
  }

  isGameOn() {
    return this.gameCalc.isGameOn()
  }

  currentPosition() {
    return tail(this.times)?.position
  }
}

export class GameTimeCalculator {
  times: GameTime[]
  game: Game
  constructor(game: Game) {
    if (!game) {
      throw new Error("Game cannot be null!")
    }
    this.game = game
    if (!game.gameTime) {
      game.gameTime = []
    }
    this.times = game.gameTime
  }

  start() {
    let time = tail(this.times)
    if (time && !time.end) {
      return
    }
    this.times.push({
      start: Date.now(),
    })
  }

  end(now?: number) {
    let time = tail(this.times)
    if (!time || !time.start) {
      throw new Error("Cannot end time without starting!")
    }
    if (!time.end) {
      time.end = now || Date.now()
    }
  }

  isGameOn() {
    let time = tail(this.times)
    return !time?.end && time?.start
  }

  getLastStartTime() {
    return tail(this.times)?.start
  }

  getLastEndTime() {
    return tail(this.times)?.end
  }

  total() {
    return getTotal(this.times)
  }

  currentTotal() {
    return getCurrentTotal(this.times)
  }
}

export function calcInversion(color: number, alpha: number) {
  if (alpha >= .4) return 255 - color
  return color
}

export function invertRGBA(rgba: number[]) {
  let [r, g, b, a] = rgba
  return [calcInversion(r, a), calcInversion(g, a), calcInversion(b, a)]
}
