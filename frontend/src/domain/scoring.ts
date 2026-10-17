import type { TeamScores, TeamSide } from './models';

export const MATCH_POINTS = 16;

export type ScoreError =
  { readonly code: 'invalid-score'; readonly team: TeamSide } | { readonly code: 'invalid-total' };

export type ScoreValidation =
  | { readonly valid: true; readonly scores: TeamScores }
  | { readonly valid: false; readonly error: ScoreError };

/** No coercion: blanks, strings, null, NaN, and infinities are invalid. */
export function isValidScore(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MATCH_POINTS
  );
}

/** Validates each side before the total; reports team A first if both are invalid. */
export function validateScores(teamA: unknown, teamB: unknown): ScoreValidation {
  if (!isValidScore(teamA)) {
    return { valid: false, error: { code: 'invalid-score', team: 'teamA' } };
  }
  if (!isValidScore(teamB)) {
    return { valid: false, error: { code: 'invalid-score', team: 'teamB' } };
  }
  if (teamA + teamB !== MATCH_POINTS) {
    return { valid: false, error: { code: 'invalid-total' } };
  }
  return { valid: true, scores: { teamA, teamB } };
}

/** Returns a fresh pair after editing either team; never clamps or mutates input. */
export function deriveScores(changedTeam: TeamSide, score: unknown): ScoreValidation {
  if (!isValidScore(score)) {
    return { valid: false, error: { code: 'invalid-score', team: changedTeam } };
  }
  const opponentScore = MATCH_POINTS - score;
  return {
    valid: true,
    scores:
      changedTeam === 'teamA'
        ? { teamA: score, teamB: opponentScore }
        : { teamA: opponentScore, teamB: score },
  };
}
