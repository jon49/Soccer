export function teamNav(teamId: number) {
    return [
        { name: "Players", url: `/web/players?teamId=${teamId}` },
        { name: "Games", url: `/web/games?teamId=${teamId}` },
        { name: "Stats", url: `/web/stats?teamId=${teamId}` },
        { name: "Formation", url: `/web/positions?teamId=${teamId}` },
    ]
}

