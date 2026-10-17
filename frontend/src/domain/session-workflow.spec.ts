import { describe, expect, it } from 'vitest';
import { confirmResult, createSession, endSession } from './session-workflow';
import { parseSessionLibrary, serializeSessionLibrary } from './local-session-format';
import { sessionStandings } from './statistics';

const now = '2026-10-17T10:00:00.000Z';

const players = ['Anna', 'Bo', 'Cleo', 'Dan', 'Eva', 'Finn'].map((name, i) => ({
  id: String(i),
  name,
}));

const create = (size = 5) => createSession(players.slice(0, size), 'session', 'match-1', now);

describe.each([5, 6])('%i-player local session workflow', (size) => {
  it('publishes one match, records results, and resumes the same next match after serialization', () => {
    const original = create(size);
    let session = original.session;

    for (let i = 1; i <= 10; i++) {
      const previous = session.activeMatch!;
      const before = structuredClone(session);

      session = confirmResult(session, previous.id, { teamA: 11, teamB: 5 }, `match-${i + 1}`, now);

      expect(before.history).toHaveLength(i - 1);
      expect(session.history).toHaveLength(i);
      expect(session.history.at(-1)?.teamA).toEqual(previous.teamA);
      expect(session.history.at(-1)?.result.scores).toEqual({ teamA: 11, teamB: 5 });
      expect(session.activeMatch?.sequence).toBe(i + 1);
      expect(session.activeMatch?.id).toBe(`match-${i + 1}`);

      const restored = parseSessionLibrary(serializeSessionLibrary([{ ...original, session }]))[0];

      expect(restored.session).toEqual(session);

      const next = restored.session.activeMatch!;

      expect(new Set([...next.teamA, ...next.teamB]).size).toBe(4);
      expect(next.restingPlayerIds).toHaveLength(size - 4);
      expect(next.restingPlayerIds.some((id) => previous.restingPlayerIds.includes(id))).toBe(
        false,
      );
    }

    expect(original.session.history).toHaveLength(0);
  });

  it('makes duplicate confirmations idempotent and rejects conflicting results', () => {
    const session = create(size).session;
    const saved = confirmResult(session, 'match-1', { teamA: 8, teamB: 8 }, 'match-2', now);

    expect(confirmResult(saved, 'match-1', { teamA: 8, teamB: 8 }, 'unused', now)).toBe(saved);
    expect(() => confirmResult(saved, 'match-1', { teamA: 16, teamB: 0 }, 'unused', now)).toThrow(
      'different result',
    );
    expect(() => confirmResult(saved, 'unknown', { teamA: 8, teamB: 8 }, 'unused', now)).toThrow(
      'no longer active',
    );
  });

  it('ends at any time, retains completed history, and blocks further scoring', () => {
    const doc = create(size);
    const played = confirmResult(doc.session, 'match-1', { teamA: 16, teamB: 0 }, 'match-2', now);
    const ended = endSession(played, now);

    expect(ended.status).toBe('ended');
    expect(ended.activeMatch).toBeNull();
    expect(ended.history).toEqual(played.history);
    expect(endSession(ended, now)).toBe(ended);
    expect(() => confirmResult(ended, 'match-2', { teamA: 8, teamB: 8 }, 'match-3', now)).toThrow();
    expect(
      parseSessionLibrary(serializeSessionLibrary([{ ...doc, session: ended }]))[0].session,
    ).toEqual(ended);
    expect(endSession(doc.session, now).history).toHaveLength(0);
  });
});

describe('workflow validation and statistics', () => {
  it('rejects invalid rosters, names, scores, and reused match IDs', () => {
    expect(() => createSession(players.slice(0, 4), 's', 'm', now)).toThrow();
    expect(() =>
      createSession([...players.slice(0, 4), { id: '4', name: ' ANNA ' }], 's', 'm', now),
    ).toThrow();
    expect(() =>
      createSession([...players.slice(0, 4), { id: '4', name: ' ' }], 's', 'm', now),
    ).toThrow();

    const session = create().session;

    for (const scores of [
      { teamA: -1, teamB: 17 },
      { teamA: 8.5, teamB: 7.5 },
      { teamA: 8, teamB: 7 },
    ]) {
      expect(() => confirmResult(session, 'match-1', scores, 'match-2', now)).toThrow();
    }

    expect(() =>
      confirmResult(session, 'match-1', { teamA: 8, teamB: 8 }, 'match-1', now),
    ).toThrow();
  });

  it('derives points, averages, wins/losses/draws, rests, and separate encounters from history', () => {
    const doc = create();
    const first = doc.session.activeMatch!;
    const session = confirmResult(doc.session, first.id, { teamA: 11, teamB: 5 }, 'm2', now);
    const rows = sessionStandings(doc.players, session.history);
    const row = (id: string) => rows.find((r) => r.player.id === id)!;
    const winner = row(first.teamA[0]);

    expect(winner).toMatchObject({
      points: 11,
      played: 1,
      average: 11,
      wins: 1,
      losses: 0,
      ties: 0,
      rests: 0,
    });
    expect(winner.partners[first.teamA[1]]).toBe(1);
    expect(winner.opponents[first.teamA[1]]).toBeUndefined();
    expect(winner.opponents[first.teamB[0]]).toBe(1);
    expect(row(first.teamB[0])).toMatchObject({ points: 5, losses: 1 });
    expect(row(first.restingPlayerIds[0])).toMatchObject({
      points: 0,
      played: 0,
      average: null,
      rests: 1,
    });

    const second = confirmResult(session, 'm2', { teamA: 8, teamB: 8 }, 'm3', now);
    const after = sessionStandings(doc.players, second.history);

    expect(after.reduce((n, r) => n + r.points, 0)).toBe(64);
    expect(after.reduce((n, r) => n + r.ties, 0)).toBe(4);

    const corrected = {
      ...second.history[0],
      result: { scores: { teamA: 16, teamB: 0 }, confirmedAt: now },
    };

    expect(
      sessionStandings(doc.players, [corrected]).find((r) => r.player.id === first.teamA[0])
        ?.points,
    ).toBe(16);
  });

  it('orders unequal appearances by average points, even when total points order differs', () => {
    const first = {
      id: 'm1',
      sessionId: 's',
      sequence: 1,
      status: 'completed' as const,
      teamA: ['0', '1'] as const,
      teamB: ['2', '3'] as const,
      restingPlayerIds: ['4'],
      publishedAt: now,
      result: { scores: { teamA: 1, teamB: 15 }, confirmedAt: now },
    };
    const second = {
      ...first,
      id: 'm2',
      sequence: 2,
      teamA: ['0', '4'] as const,
      teamB: ['1', '2'] as const,
      restingPlayerIds: ['3'],
      result: { scores: { teamA: 16, teamB: 0 }, confirmedAt: now },
    };
    const rows = sessionStandings(players.slice(0, 5), [first, second]);

    expect(rows[0]).toMatchObject({ player: { id: '4' }, average: 16, points: 16 });
    expect(rows.find((r) => r.player.id === '0')).toMatchObject({ average: 8.5, points: 17 });
  });
});

describe('runtime saved-data validation', () => {
  it('keeps only a versioned, validated library and rejects malformed records without scheduling', () => {
    expect(parseSessionLibrary(null)).toEqual([]);

    const doc = create();
    const mutations: unknown[] = [
      null,
      {},
      { version: 9, sessions: [] },
      { version: 1, sessions: [doc, doc] },
      { version: 1, sessions: [{ ...doc, players: [] }] },
      { version: 1, sessions: [{ ...doc, session: { ...doc.session, createdAt: 'bad' } }] },
      { version: 1, sessions: [{ ...doc, session: { ...doc.session, activeMatch: null } }] },
      {
        version: 1,
        sessions: [
          {
            ...doc,
            session: {
              ...doc.session,
              activeMatch: { ...doc.session.activeMatch, teamA: ['0', '0'] },
            },
          },
        ],
      },
      {
        version: 1,
        sessions: [
          { ...doc, session: { ...doc.session, activePlayerIds: ['0', '1', '2', '3', '3'] } },
        ],
      },
    ];

    for (const value of mutations)
      expect(() => parseSessionLibrary(JSON.stringify(value))).toThrow();

    expect(() => parseSessionLibrary('broken json')).toThrow();

    const other = createSession(players.slice(0, 5), 'other-session', 'other-match', now);

    expect(() => serializeSessionLibrary([doc, other])).toThrow('Only one');

    const completed = {
      ...doc,
      session: confirmResult(doc.session, 'match-1', { teamA: 8, teamB: 8 }, 'match-2', now),
    };
    const invalidResult = JSON.parse(serializeSessionLibrary([completed]));

    invalidResult.sessions[0].session.history[0].result.scores.teamA = 9;

    expect(() => parseSessionLibrary(JSON.stringify(invalidResult))).toThrow('scores');

    const saved = JSON.parse(serializeSessionLibrary([doc]));

    saved.sessions[0].session.activeMatch.publishedAt = 'not a time';

    expect(() => parseSessionLibrary(JSON.stringify(saved))).toThrow();
  });
});
