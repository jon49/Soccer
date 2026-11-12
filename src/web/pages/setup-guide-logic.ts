import type { TeamId } from "../server/db.js";

// What a team has so far, for the Getting started guide.
export interface SetupProgress {
  teamId: TeamId;
  players: number;
  positions: number;
  games: number;
  // The first game with a clock started, if any; otherwise the soonest game.
  gameId?: number;
  started: boolean;
}

export type SetupStepId = "team" | "players" | "formation" | "game" | "play";

export interface SetupStep {
  id: SetupStepId;
  title: string;
  // What to do, while the step isn't done yet.
  todo: string;
  url: string;
  done: boolean;
}

// The steps a new coach takes, in order: make a team, add players, set up a
// formation, add a game, then run the game. The guide shows until a game has
// been started.
export function setupSteps(p: SetupProgress): SetupStep[] {
  let team = `teamId=${p.teamId}`;
  return [
    {
      id: "team",
      title: "Make a team",
      todo: "Give your team a name and year.",
      url: "/web/teams",
      done: true,
    },
    {
      id: "players",
      title: "Add players",
      todo: "Type each player's name and tap Add. Numbers are optional.",
      url: `/web/players?${team}`,
      done: p.players > 0,
    },
    {
      id: "formation",
      title: "Set up a formation",
      todo: "Pick a template for how many play at once, then rename the positions if you like.",
      url: `/web/positions?${team}`,
      done: p.positions > 0,
    },
    {
      id: "game",
      title: "Add a game",
      todo: "Enter the date, time and opponent.",
      url: `/web/games?${team}`,
      done: p.games > 0,
    },
    {
      id: "play",
      title: "Run the match",
      todo: "Open the game, tap Open match, put players on the field and tap the clock to start.",
      url: p.gameId != null ? `/web/match?${team}&gameId=${p.gameId}` : `/web/games?${team}`,
      done: p.started,
    },
  ];
}

// The first step not done yet, or undefined once they all are.
export function nextSetupStep(steps: SetupStep[]): SetupStep | undefined {
  return steps.find((x) => !x.done);
}
