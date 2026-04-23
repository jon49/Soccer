import { describe, it, beforeEach } from "node:test"
import assert from "node:assert/strict"
import type { Game, PlayerGame } from "../../server/db.js"
import {
  tail,
  getTotal,
  getCurrentTotal,
  isInPlayPlayer,
  isOnDeckPlayer,
  isOutPlayer,
  filterOutPlayers,
  filterNotPlayingPlayers,
  calcInversion,
  invertRGBA,
  GameTimeCalculator,
  PlayerGameTimeCalculatorBase
} from "./state-logic.js"

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 1,
    date: "2026-01-01",
    home: true,
    points: 0,
    opponentPoints: 0,
    gameTime: [],
    ...overrides,
  }
}

function makePlayerGame(overrides: Partial<PlayerGame> = {}): PlayerGame {
  return {
    _rev: 0,
    playerId: 1,
    gameId: 1,
    stats: [],
    gameTime: [],
    ...overrides,
  }
}

describe("tail", () => {
  it("returns the last element of an array", () => {
    assert.equal(tail([1, 2, 3]), 3)
  })

  it("returns undefined for an empty array", () => {
    assert.equal(tail([]), undefined)
  })
})

describe("getTotal", () => {
  it("returns 0 when empty", () => {
    assert.equal(getTotal([]), 0)
  })

  it("sums completed intervals", () => {
    assert.equal(
      getTotal([
        { start: 100, end: 200 },
        { start: 300, end: 500 },
      ]),
      300
    )
  })

  it("ignores intervals without end", () => {
    assert.equal(
      getTotal([
        { start: 100, end: 200 },
        { start: 300 },
      ]),
      100
    )
  })

  it("ignores intervals without start", () => {
    assert.equal(getTotal([{ end: 200 }]), 0)
  })
})

describe("getCurrentTotal", () => {
  it("returns completed total when no open interval", () => {
    assert.equal(
      getCurrentTotal([{ start: 100, end: 200 }]),
      100
    )
  })

  it("adds elapsed time on open tail interval", () => {
    let start = Date.now() - 5_000
    let total = getCurrentTotal([
      { start: 100, end: 400 }, // 300
      { start },                // ~5_000
    ])
    // sanity: completed portion is included and open portion is at least 5s
    assert.ok(total >= 5_000 + 300)
    assert.ok(total < 5_000 + 300 + 1_000)
  })

  it("ignores open tail that has no start", () => {
    assert.equal(
      getCurrentTotal([
        { start: 100, end: 400 },
        {},
      ]),
      300
    )
  })
})

describe("player status predicates", () => {
  it("isInPlayPlayer matches inPlay status", () => {
    assert.equal(isInPlayPlayer(makePlayerGame({ status: { _: "inPlay", position: 0 } })), true)
    assert.equal(isInPlayPlayer(makePlayerGame({ status: { _: "out" } })), false)
    assert.equal(isInPlayPlayer(makePlayerGame()), false)
  })

  it("isOnDeckPlayer matches onDeck status", () => {
    assert.equal(isOnDeckPlayer(makePlayerGame({ status: { _: "onDeck", targetPosition: 1 } })), true)
    assert.equal(isOnDeckPlayer(makePlayerGame({ status: { _: "inPlay", position: 0 } })), false)
  })

  it("isOutPlayer matches only out status (not missing status)", () => {
    assert.equal(isOutPlayer(makePlayerGame({ status: { _: "out" } })), true)
    assert.equal(isOutPlayer(makePlayerGame()), false)
  })

  it("filterOutPlayers also treats missing status as out", () => {
    assert.equal(filterOutPlayers(makePlayerGame()), true)
    assert.equal(filterOutPlayers(makePlayerGame({ status: { _: "out" } })), true)
    assert.equal(filterOutPlayers(makePlayerGame({ status: { _: "inPlay", position: 0 } })), false)
  })

  it("filterNotPlayingPlayers matches notPlaying only", () => {
    assert.equal(filterNotPlayingPlayers(makePlayerGame({ status: { _: "notPlaying" } })), true)
    assert.equal(filterNotPlayingPlayers(makePlayerGame()), false)
  })
})

describe("calcInversion / invertRGBA", () => {
  it("inverts channel when alpha >= 0.4", () => {
    assert.equal(calcInversion(100, 0.4), 155)
    assert.equal(calcInversion(0, 1), 255)
  })

  it("leaves channel alone when alpha < 0.4", () => {
    assert.equal(calcInversion(100, 0.39), 100)
  })

  it("invertRGBA inverts r,g,b based on alpha and drops alpha", () => {
    assert.deepEqual(invertRGBA([10, 20, 30, 0.5]), [245, 235, 225])
    assert.deepEqual(invertRGBA([10, 20, 30, 0.1]), [10, 20, 30])
  })
})

describe("GameTimeCalculator", () => {
  it("throws when constructed with null game", () => {
    assert.throws(() => new GameTimeCalculator(null as any), /Game cannot be null/)
  })

  it("initializes gameTime when missing", () => {
    let game = { ...makeGame(), gameTime: undefined as any } as Game
    let calc = new GameTimeCalculator(game)
    assert.deepEqual(calc.times, [])
    assert.equal(game.gameTime, calc.times)
  })

  it("start pushes a new interval when empty", () => {
    let game = makeGame()
    let calc = new GameTimeCalculator(game)
    calc.start()
    assert.equal(calc.times.length, 1)
    assert.equal(typeof calc.times[0].start, "number")
    assert.equal(calc.times[0].end, undefined)
  })

  it("start is a no-op when current interval is still open", () => {
    let game = makeGame()
    let calc = new GameTimeCalculator(game)
    calc.start()
    let firstStart = calc.times[0].start
    calc.start()
    assert.equal(calc.times.length, 1)
    assert.equal(calc.times[0].start, firstStart)
  })

  it("start pushes a new interval after previous ended", () => {
    let game = makeGame({ gameTime: [{ start: 100, end: 200 }] })
    let calc = new GameTimeCalculator(game)
    calc.start()
    assert.equal(calc.times.length, 2)
  })

  it("end throws when times is empty", () => {
    let calc = new GameTimeCalculator(makeGame())
    assert.throws(() => calc.end(), /Cannot end time without starting/)
  })

  it("end sets the end time on the open interval", () => {
    let game = makeGame({ gameTime: [{ start: 100 }] })
    let calc = new GameTimeCalculator(game)
    calc.end(500)
    assert.equal(calc.times[0].end, 500)
  })

  it("end does not overwrite an already-ended interval", () => {
    let game = makeGame({ gameTime: [{ start: 100, end: 200 }] })
    let calc = new GameTimeCalculator(game)
    calc.end(999)
    assert.equal(calc.times[0].end, 200)
  })

  it("isGameOn reflects whether current interval is open", () => {
    let calc = new GameTimeCalculator(makeGame())
    assert.ok(!calc.isGameOn())
    calc.start()
    assert.ok(calc.isGameOn())
    calc.end(Date.now() + 1)
    assert.ok(!calc.isGameOn())
  })

  it("getLastStartTime / getLastEndTime return the tail fields", () => {
    let game = makeGame({
      gameTime: [
        { start: 100, end: 200 },
        { start: 300, end: 400 },
      ],
    })
    let calc = new GameTimeCalculator(game)
    assert.equal(calc.getLastStartTime(), 300)
    assert.equal(calc.getLastEndTime(), 400)
  })
})

describe("PlayerGameTimeCalculatorBase", () => {
  let game: Game
  let gameCalc: GameTimeCalculator
  let player: PlayerGame
  let calc: PlayerGameTimeCalculatorBase

  beforeEach(() => {
    game = makeGame()
    gameCalc = new GameTimeCalculator(game)
    gameCalc.start() // game is on
    player = makePlayerGame()
    calc = new PlayerGameTimeCalculatorBase(player, gameCalc)
  })

  it("initializes gameTime on the player when missing", () => {
    let p = { ...makePlayerGame(), gameTime: undefined as any } as PlayerGame
    let c = new PlayerGameTimeCalculatorBase(p, gameCalc)
    assert.deepEqual(c.times, [])
    assert.equal(p.gameTime, c.times)
  })

  it("start is a no-op when game is not on", () => {
    let offGame = makeGame()
    let offGameCalc = new GameTimeCalculator(offGame)
    let c = new PlayerGameTimeCalculatorBase(player, offGameCalc)
    c.position("striker")
    c.start()
    assert.equal(c.times[0].start, undefined)
  })

  it("start is a no-op when no current position", () => {
    calc.start()
    assert.equal(calc.times.length, 0)
  })

  it("start sets the start time when a position exists and interval is open", () => {
    calc.position("striker")
    // position() on empty list just stages the position; start() is what opens the interval.
    assert.equal(calc.times[0].start, undefined)
    calc.start()
    assert.equal(typeof calc.times[0].start, "number")
  })

  it("start is a no-op when interval already ended", () => {
    calc.times.push({ position: "striker", start: 100, end: 200 })
    calc.start()
    assert.equal(calc.times[0].end, 200)
  })

  it("end sets end on open interval", () => {
    calc.position("striker")
    calc.start()
    calc.end(999)
    assert.equal(calc.times[0].end, 999)
  })

  it("end is a no-op when no start on current interval", () => {
    calc.times.push({ position: "striker" })
    calc.end(999)
    assert.equal(calc.times[0].end, undefined)
  })

  it("end is a no-op when already ended", () => {
    calc.times.push({ position: "striker", start: 100, end: 200 })
    calc.end(999)
    assert.equal(calc.times[0].end, 200)
  })

  it("position on fresh calc pushes a position entry", () => {
    calc.position("striker")
    assert.equal(calc.times[0].position, "striker")
  })

  it("position on a not-yet-started entry updates position in place", () => {
    // Game is off so start() won't set start
    let offGame = makeGame()
    let offGameCalc = new GameTimeCalculator(offGame)
    let c = new PlayerGameTimeCalculatorBase(player, offGameCalc)
    c.position("striker")
    c.position("keeper")
    assert.equal(c.times.length, 1)
    assert.equal(c.times[0].position, "keeper")
  })

  it("position while playing ends current interval and opens a new one", () => {
    calc.position("striker")
    calc.start()
    assert.ok(calc.hasStarted())
    calc.position("keeper")
    assert.equal(calc.times.length, 2)
    assert.equal(typeof calc.times[0].end, "number")
    assert.equal(calc.times[1].position, "keeper")
    assert.equal(typeof calc.times[1].start, "number")
    assert.equal(calc.times[1].end, undefined)
  })

  it("playerOut pops the unstarted entry when not started", () => {
    let offGame = makeGame()
    let offGameCalc = new GameTimeCalculator(offGame)
    let c = new PlayerGameTimeCalculatorBase(player, offGameCalc)
    c.position("striker") // pushed without start because game off
    c.playerOut()
    assert.equal(c.times.length, 0)
  })

  it("playerOut ends the current interval when started", () => {
    calc.position("striker")
    calc.start()
    calc.playerOut()
    assert.ok(calc.times[0].end)
    assert.equal(calc.times.length, 1)
  })

  it("hasStarted reflects whether the tail interval has a start", () => {
    assert.equal(calc.hasStarted(), false)
    calc.position("striker")
    assert.equal(calc.hasStarted(), false)
    calc.start()
    assert.equal(calc.hasStarted(), true)
  })

  it("currentPosition returns the tail entry's position", () => {
    assert.equal(calc.currentPosition(), undefined)
    calc.position("striker")
    assert.equal(calc.currentPosition(), "striker")
  })

  it("getLastStartTime returns the tail start", () => {
    calc.position("striker")
    calc.start()
    assert.equal(calc.getLastStartTime(), calc.times[0].start)
    assert.equal(typeof calc.getLastStartTime(), "number")
  })

  it("total sums completed intervals", () => {
    calc.times.push({ position: "a", start: 100, end: 300 })
    calc.times.push({ position: "b", start: 500, end: 800 })
    assert.equal(calc.total(), 500)
  })

  it("isGameOn delegates to gameCalc", () => {
    assert.equal(calc.isGameOn(), gameCalc.isGameOn())
    gameCalc.end(Date.now() + 1)
    assert.equal(calc.isGameOn(), gameCalc.isGameOn())
  })
})
