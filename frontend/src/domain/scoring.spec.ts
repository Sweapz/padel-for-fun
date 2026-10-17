import { describe, expect, it } from 'vitest';
import { deriveScores, isValidScore, validateScores } from './scoring';
import type { TeamSide } from './models';

const invalidScores: readonly unknown[] = [
  -1,
  17,
  0.5,
  8.5,
  NaN,
  Infinity,
  -Infinity,
  '',
  ' ',
  '8',
  '0',
  null,
  undefined,
  true,
  false,
  [],
  [8],
  {},
  8n,
];
const sides: readonly TeamSide[] = ['teamA', 'teamB'];

describe('score validation', () => {
  it.each([
    [0, 16],
    [16, 0],
    [8, 8],
    [11, 5],
  ])('accepts %i–%i', (teamA, teamB) => {
    expect(validateScores(teamA, teamB)).toEqual({ valid: true, scores: { teamA, teamB } });
  });

  it('exhaustively validates all 289 integer pairs in the score range', () => {
    for (let teamA = 0; teamA <= 16; teamA++) {
      expect(isValidScore(teamA)).toBe(true);
      for (let teamB = 0; teamB <= 16; teamB++) {
        const result = validateScores(teamA, teamB);
        if (teamA + teamB === 16) {
          expect(result).toEqual({ valid: true, scores: { teamA, teamB } });
        } else {
          expect(result).toEqual({ valid: false, error: { code: 'invalid-total' } });
        }
      }
    }
  });

  it.each(invalidScores)('rejects invalid input %s without coercion', (input) => {
    expect(isValidScore(input)).toBe(false);
    expect(validateScores(input, 8)).toEqual({
      valid: false,
      error: { code: 'invalid-score', team: 'teamA' },
    });
    expect(validateScores(8, input)).toEqual({
      valid: false,
      error: { code: 'invalid-score', team: 'teamB' },
    });
  });

  it('rejects out-of-range or fractional pairs even when their total is 16', () => {
    for (const [teamA, teamB] of [
      [-1, 17],
      [17, -1],
      [7.5, 8.5],
    ]) {
      expect(validateScores(teamA, teamB).valid).toBe(false);
    }
  });

  it('reports team A first when both scores are invalid', () => {
    expect(validateScores('', null)).toEqual({
      valid: false,
      error: { code: 'invalid-score', team: 'teamA' },
    });
  });
});

describe('deriveScores', () => {
  it.each(sides)('derives the opponent for every valid edit to %s', (side) => {
    const opponent = side === 'teamA' ? 'teamB' : 'teamA';
    for (let score = 0; score <= 16; score++) {
      const result = deriveScores(side, score);
      expect(result.valid).toBe(true);
      if (!result.valid) throw new Error('Expected valid scores');
      expect(result.scores[side]).toBe(score);
      expect(result.scores[opponent]).toBe(16 - score);
      expect(validateScores(result.scores.teamA, result.scores.teamB).valid).toBe(true);
    }
  });

  it.each(sides)('rejects every invalid edit to %s without inventing a score', (side) => {
    for (const input of invalidScores) {
      expect(deriveScores(side, input)).toEqual({
        valid: false,
        error: { code: 'invalid-score', team: side },
      });
    }
  });

  it('allows editing the other side without changing an earlier result', () => {
    const first = deriveScores('teamA', 11);
    const second = deriveScores('teamB', 6);
    expect(first).toEqual({ valid: true, scores: { teamA: 11, teamB: 5 } });
    expect(second).toEqual({ valid: true, scores: { teamA: 10, teamB: 6 } });
    expect(deriveScores('teamA', 11)).toEqual(first);
  });
});
