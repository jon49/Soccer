import { validateObject } from "promise-validation"
import html from "../server/html.js"
import { Route } from "../server/route.js"
import layout from "./_layout.html.js"
import { searchParams } from "../server/utils.js"
import { queryTeamIdValidator } from "../server/validators.js"
import { teamGet } from "../server/repo-team.js"
import { playerGameAllGet } from "../server/repo-player-game.js"
import { teamNav } from "./_shared-views.js"

function millisecondsToHourMinutes(milliseconds: number) {
    let seconds = Math.floor(milliseconds / 1e3)
    let minutes = Math.floor(seconds / 60)
    let hours = Math.floor(minutes / 60)
    minutes -= hours * 60
    seconds -= minutes * 60 + hours * 60 * 60
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
}

async function render(req: Request) {
    let { teamId } = await validateObject(searchParams(req), queryTeamIdValidator)
    let team = await teamGet(teamId)
    let playerMap = team.players.reduce((acc, x) => { acc.set(x.id, x.name); return acc }, new Map as Map<number, string>)
    let playersGames = await Promise.all(team.games.map(x => playerGameAllGet(teamId, x.id, [])))
    // Get all positions with how much time each player played in that position
    // over all games.
    let players: Set<number> = new Set()
    let positions: Set<string> = new Set()
    let positionPlayerStats = playersGames.reduce((acc, xs) => {
        for (let playerGame of xs) {
            players.add(playerGame.playerId)
            for (let time of playerGame.gameTime) {
                if (!time.position) continue
                positions.add(time.position)
                let position = acc[time.position]
                if (!position) acc[time.position] = position = {}
                let player = position[playerGame.playerId]
                if (!player) position[playerGame.playerId] = player = { time: 0 }
                if (time.start && time.end)
                    player.time += time.end - time.start
            }
        }
        return acc
    }, {} as { [position: string]: { [playerId: string]: { time: number } } })

    let playerIdList = Array.from(players).sort((a, b) => (playerMap.get(a) ?? "").localeCompare(playerMap.get(b) ?? ""))
    let positionList = Array.from(positions).sort()

    return html`
            <h1>Stats</h1>
            <h2>Positions Played (Hours:Minutes:Seconds)</h2>
            <table>
            <thead>
                <tr>
                    <th>Player</th>
                    ${positionList.map(x => html`<th>${x}</th>`)}
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
                ${function* (){
                    for (let playerId of playerIdList) {
                        yield html`<tr><th>${playerMap.get(playerId)}</th>`
                        for (let position of positionList) {
                            let stats = positionPlayerStats[position]
                            if (!stats) {
                                yield html`<td></td>`
                                continue
                            }
                            let playerStats = positionPlayerStats[position][playerId]
                            yield html`<td>${playerStats ? millisecondsToHourMinutes(playerStats.time) : ""}</td>`
                        }
                        let totalTime = 0
                        for (let position of positionList) {
                            let stats = positionPlayerStats[position]
                            if (!stats) continue
                            let playerStats = positionPlayerStats[position][playerId]
                            if (!playerStats) continue
                            totalTime += playerStats.time
                        }
                        yield html`<td>${millisecondsToHourMinutes(totalTime)}</td>`
                        yield html`</tr>`
                    }
                }}
            </tbody>
            </table>

            <h2>Number of Games Played</h2>
            <table>
                <thead>
                    <tr> <th>Player</th> <th>Games</th> </tr>
                </thead>
            <tbody>
            ${function* (){
                for (let playerId of playerIdList) {
                    yield html`<tr><th>${playerMap.get(playerId)}</th>`
                    let games = 0
                    for (let playerGames of playersGames) {
                        if (playerGames.find(x => x.playerId === playerId)?.gameTime?.length ?? 0 > 0) {
                            games++
                        }
                    }
                    yield html`<td>${games}</td>`
                }
            }}
            </tbody>
            </table>
        `
}

const router: Route = {
    route: /\/stats\/$/,
    async get(req: Request) {
        let search = searchParams<{ teamId: string }>(req)
        return layout(req, {
            main: await render(req),
            nav: teamNav(+search.teamId),
            title: "Games"
        })
    },
}

export default router

