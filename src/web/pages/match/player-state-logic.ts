// Converts a team's configured stale-highlight threshold (in minutes) into
// milliseconds. A value of 0 (or unset, falling back to the default) is
// treated as "highlight enabled"; the team can only disable it by setting 0.
export function staleAfterMs(minutes: number | undefined, defaultMinutes: number): number | null {
  let m = minutes ?? defaultMinutes;
  return m > 0 ? m * 60 * 1000 : null;
}

// The in-play grid is full once every position is filled by an in-play or
// on-deck player.
export function isRosterFull(
  countInPlayPlayers: number,
  countPlayersOnDeck: number,
  totalPositions: number,
): boolean {
  return countInPlayPlayers + countPlayersOnDeck >= totalPositions;
}
