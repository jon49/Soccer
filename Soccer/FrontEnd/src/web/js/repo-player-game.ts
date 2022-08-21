import { Activity, get, getMany, PlayerGame, Position } from "./db";

export async function playerGameAllGet(gameId: number, playerNames: string[]) {
    let playersGame = await getMany<PlayerGame>(playerNames.map(x => `${gameId}|${x}`))
    playersGame = playersGame.filter(x => x)
    let omittedPlayers : PlayerGame[] = []
    for (let player of playerNames) {
        if (playersGame.find(x => x.name === player)) continue
        omittedPlayers.push({
            gameId,
            gameTime: [],
            name: player,
            stats: [],
        })
    }
    return playersGame.concat(omittedPlayers)
}

export async function positionGetAll(teamId: number) : Promise<Position[]> {
    return (await get<Position[]>(`${teamId}|positions`)) ?? []
}

export async function activityGetAll(teamId: number) : Promise<Activity[]> {
    return (await get<Activity[]>(`${teamId}|activities`)) ?? []
}