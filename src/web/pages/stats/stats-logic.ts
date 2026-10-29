import type { Game, GameState } from "../../server/db.js";

// The games that have been played (started at least once), soonest first,
// for the per-game columns of the stats tables.
export function playedInOrder<T extends { game: Game; state: GameState }>(rows: T[]): T[] {
  return rows
    .filter((x) => x.state.status)
    .sort(
      (a, b) =>
        a.game.date.localeCompare(b.game.date) ||
        (a.game.time ?? "").localeCompare(b.game.time ?? ""),
    );
}
