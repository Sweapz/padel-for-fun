import { describe, expect, it } from 'vitest';
import { playerHistoricalStats, playerSessionHistory } from './player-history';
import { createSession, endSession } from './session-workflow';
import type { SessionDocument } from './session-workflow';
import type { CompletedMatch } from './models';

const players = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` }));
const date = '2026-10-17T10:00:00.000Z';

function session(id: string, scores: readonly number[], createdAt = date): SessionDocument {
  const doc = createSession(players, id, `${id}-next`, createdAt);
  const history = scores.map((score, i): CompletedMatch => ({
    id: `${id}-${i}`,
    sessionId: id,
    sequence: i + 1,
    status: 'completed',
    teamA: ['p0', 'p1'],
    teamB: ['p2', 'p3'],
    restingPlayerIds: ['p4'],
    publishedAt: createdAt,
    result: { scores: { teamA: score, teamB: 16 - score }, confirmedAt: createdAt },
  }));

  return { ...doc, session: endSession({ ...doc.session, history }, createdAt) };
}

describe('player history statistics', () => {
  it('derives per-session and weighted lifetime averages, totals, and personal bests', () => {
    const earlier = session('early', [10, 6], '2026-10-15T10:00:00.000Z');
    const later = session('later', [12]);
    const empty = session('empty', []);
    const documents = [later, empty, earlier];
    const before = structuredClone(documents);
    const history = playerSessionHistory('p0', documents);

    expect(history.map((row) => row.sessionId)).toEqual(['early', 'empty', 'later']);
    expect(history[0]).toMatchObject({ points: 16, played: 2, average: 8, bestGame: 10 });
    expect(playerHistoricalStats(history)).toEqual({
      sessionsPlayed: 2,
      matchesPlayed: 3,
      points: 28,
      averagePointsPerSession: 14,
      averagePointsPerMatch: 28 / 3,
      maxSessionPoints: 16,
      maxGamePoints: 12,
    });
    expect(documents).toEqual(before);
  });

  it('counts the other team correctly, distinguishes genuine zero from no data, and excludes rests', () => {
    const doc = session('s', [16]);

    expect(playerHistoricalStats(playerSessionHistory('p2', [doc]))).toMatchObject({
      sessionsPlayed: 1,
      matchesPlayed: 1,
      points: 0,
      averagePointsPerMatch: 0,
      averagePointsPerSession: 0,
      maxGamePoints: 0,
      maxSessionPoints: 0,
    });
    expect(playerHistoricalStats(playerSessionHistory('p4', [doc]))).toMatchObject({
      sessionsPlayed: 0,
      matchesPlayed: 0,
      averagePointsPerSession: null,
      averagePointsPerMatch: null,
      maxGamePoints: null,
      maxSessionPoints: null,
    });
    expect(playerSessionHistory('unknown-same-name', [doc])).toEqual([]);
    expect(playerHistoricalStats([]).averagePointsPerSession).toBeNull();
  });

  it('includes only completed appearances from an active session and recomputes corrected results', () => {
    const doc = session('s', [5]);
    const active = {
      ...doc,
      session: { ...doc.session, status: 'active' as const, endedAt: undefined, activeMatch: null },
    };

    expect(playerSessionHistory('p0', [active])[0]).toMatchObject({
      status: 'active',
      points: 5,
      played: 1,
    });

    const corrected = {
      ...doc,
      session: {
        ...doc.session,
        history: [
          {
            ...doc.session.history[0],
            result: { scores: { teamA: 11, teamB: 5 }, confirmedAt: date },
          },
        ],
      },
    };

    expect(playerHistoricalStats(playerSessionHistory('p0', [corrected])).maxGamePoints).toBe(11);
  });
});
