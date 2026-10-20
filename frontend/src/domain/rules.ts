/** Current game format. Changing these rules may require saved-data migration. */
export const MATCH_POINTS = 16;
export const SUPPORTED_PLAYER_COUNTS = [5, 6] as const;
export const PLAYERS_PER_TEAM = 2;
export const PLAYERS_PER_MATCH = PLAYERS_PER_TEAM * 2;
export const COURT_COUNT = 1;

/** Derived ranking policy only; changing this recalculates historical standings. */
export const SESSION_RESULT_POINTS = { win: 2, draw: 1, loss: 0 } as const;

export interface SessionRankingPolicy {
  readonly win: number;
  readonly draw: number;
  readonly loss: number;
}

export function isSupportedPlayerCount(
  value: number,
): value is (typeof SUPPORTED_PLAYER_COUNTS)[number] {
  return SUPPORTED_PLAYER_COUNTS.some((count) => count === value);
}
