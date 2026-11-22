import type { TeamId } from "../server/db.js";
export function teamNav(teamId: TeamId) {
  return [
    { name: "Players", url: `/web/players?teamId=${teamId}` },
    { name: "Games", url: `/web/games?teamId=${teamId}` },
    { name: "Stats", url: `/web/stats?teamId=${teamId}` },
    { name: "Formation", url: `/web/positions?teamId=${teamId}` },
  ];
}

// The tabs on the Teams page (and the Install page): how to install the app.
export function teamsNav() {
  return [{ name: "Install", url: "/web/install" }];
}
