export function teamNav(teamId: number) {
    return [
        { name: "Games", url: `/web/games?teamId=${teamId}` },
        { name: "Stats", url: `/web/stats?teamId=${teamId}` },
        { name: "Positions", url: `/web/positions?teamId=${teamId}` },
        { name: "Activities", url: `/web/activities?teamId=${teamId}` }
    ]
}

