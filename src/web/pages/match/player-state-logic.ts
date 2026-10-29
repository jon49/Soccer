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

// The share of the game each available player would get if field time were
// split evenly: field spots over players available. 1 when everyone fits on
// the field (or there are no spots), so no one is ever ahead.
export function fairShareRatio(spots: number, available: number): number {
  return spots > 0 && available > spots ? spots / available : 1;
}
