import { describe, expect, it } from 'vitest';
import type { CompletedMatch } from './models';
import { enumerateMatchups, matchupKey, scheduleNextMatch } from './scheduler';
import type { Matchup } from './scheduler';

const players = ['a', 'b', 'c', 'd', 'e', 'f'];

const stamp = '2026-10-17T10:00:00.000Z';

function complete(match: Matchup, sequence: number): CompletedMatch {
  return {
    ...match,
    id: `match-${sequence}`,
    sessionId: 'session',
    sequence,
    publishedAt: stamp,
    status: 'completed',
    result: { scores: { teamA: 8, teamB: 8 }, confirmedAt: stamp },
  };
}

// Independent metric collection: do not use scheduler metadata or its key helpers.
function metrics(ids: readonly string[], history: readonly CompletedMatch[]) {
  const appearances = Object.fromEntries(ids.map((id) => [id, 0]));
  const rests = Object.fromEntries(ids.map((id) => [id, 0]));
  const partners = new Map<string, number>();
  const opponents = new Map<string, number>();
  const exact = new Set<string>();
  const pair = (a: string, b: string) => JSON.stringify([a, b].sort());
  const add = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  let consecutiveRests = 0;
  let repeatedExactMatchups = 0;
  let previousRests: readonly string[] = [];

  for (const match of history) {
    for (const id of [...match.teamA, ...match.teamB]) appearances[id]++;

    for (const id of match.restingPlayerIds) {
      rests[id]++;

      if (previousRests.includes(id)) consecutiveRests++;
    }

    add(partners, pair(...match.teamA));
    add(partners, pair(...match.teamB));

    for (const a of match.teamA) for (const b of match.teamB) add(opponents, pair(a, b));

    const key = JSON.stringify([pair(...match.teamA), pair(...match.teamB)].sort());

    if (exact.has(key)) repeatedExactMatchups++;

    exact.add(key);
    previousRests = match.restingPlayerIds;
  }

  const allPairs = ids.flatMap((a, i) => ids.slice(i + 1).map((b) => pair(a, b)));
  const frequencies = (map: ReadonlyMap<string, number>) => {
    const counts = allPairs.map((key) => map.get(key) ?? 0);

    return {
      covered: counts.filter((n) => n > 0).length,
      possible: counts.length,
      min: Math.min(...counts),
      max: Math.max(...counts),
    };
  };

  return {
    appearances,
    rests,
    consecutiveRests,
    partners: frequencies(partners),
    opponents: frequencies(opponents),
    repeatedExactMatchups,
    uniqueExactMatchups: exact.size,
  };
}

function simulate(ids: readonly string[], length: number, initial: readonly CompletedMatch[] = []) {
  const history = [...initial];

  while (history.length < length) {
    const next = scheduleNextMatch(ids, history);
    const participants = [...next.teamA, ...next.teamB];

    expect(new Set(participants).size).toBe(4);
    expect(next.restingPlayerIds).toHaveLength(ids.length - 4);
    expect([...participants, ...next.restingPlayerIds].sort()).toEqual([...ids].sort());
    expect(next.restingPlayerIds.some((id) => history.at(-1)?.restingPlayerIds.includes(id))).toBe(
      false,
    );

    history.push(complete(next, history.length + 1));

    const counts = Object.values(metrics(ids, history).appearances);

    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  }

  return history;
}

describe.each([5, 6])('%i-player scheduler', (size) => {
  const ids = players.slice(0, size);

  it('enumerates every unique legal assignment without side or player-order duplicates', () => {
    const candidates = enumerateMatchups(ids);

    expect(candidates).toHaveLength(size === 5 ? 15 : 45);
    expect(new Set(candidates.map(matchupKey)).size).toBe(candidates.length);

    const subsets = new Map<string, number>();

    for (const candidate of candidates) {
      const playing = [...candidate.teamA, ...candidate.teamB].sort();

      expect(new Set(playing).size).toBe(4);
      expect([...playing, ...candidate.restingPlayerIds].sort()).toEqual(ids);

      const key = JSON.stringify(playing);

      subsets.set(key, (subsets.get(key) ?? 0) + 1);

      expect(
        matchupKey({
          teamA: [candidate.teamB[1], candidate.teamB[0]],
          teamB: [candidate.teamA[1], candidate.teamA[0]],
        }),
      ).toBe(matchupKey(candidate));
    }

    expect([...subsets.values()].every((n) => n === 3)).toBe(true);
    expect(enumerateMatchups([...ids].reverse())).toEqual(candidates);
  });

  it.each([30, 300])('simulates %i matches and reports measured diversity/fairness', (length) => {
    const history = simulate(ids, length);
    const report = metrics(ids, history);

    console.info(`SCHEDULER ${size} players / ${length} matches: ${JSON.stringify(report)}`);

    expect(report.consecutiveRests).toBe(0);
    expect(Object.values(report.appearances)).toEqual(ids.map(() => (length * 4) / size));
    expect(report.partners.covered).toBe(report.partners.possible);
    expect(report.opponents.covered).toBe(report.opponents.possible);
  });

  it('is deterministic, does not mutate inputs, and resumes from history', () => {
    const history = simulate(ids, 12);
    const frozenHistory = structuredClone(history);

    function freeze(value: object) {
      Object.freeze(value);

      for (const child of Object.values(value))
        if (child && typeof child === 'object') freeze(child);
    }
    freeze(frozenHistory);

    const frozenIds = Object.freeze([...ids]);
    const expected = scheduleNextMatch(frozenIds, frozenHistory);

    expect(scheduleNextMatch(ids, history)).toEqual(expected);
    expect(scheduleNextMatch([...ids].reverse(), history)).toEqual(expected);
    expect(scheduleNextMatch(ids, structuredClone(history))).toEqual(expected);
    expect(frozenHistory).toEqual(history);

    const changedScores = history.map((match) => ({
      ...match,
      result: { ...match.result, scores: { teamA: 16, teamB: 0 } },
    }));

    expect(scheduleNextMatch(ids, changedScores)).toEqual(expected);
  });

  it('avoids consecutive rests from every possible initial matchup', () => {
    for (const first of enumerateMatchups(ids)) {
      const history = simulate(ids, 12, [complete(first, 1)]);

      expect(metrics(ids, history).consecutiveRests).toBe(0);
    }
  });
});

describe('scheduler boundaries and priorities', () => {
  it('rejects unsupported, duplicated, blank, or nonstring roster IDs', () => {
    const invalid: unknown[] = [
      [],
      players.slice(0, 4),
      [...players, 'g'],
      ['a', 'a', 'b', 'c', 'd'],
      ['a', 'b', 'c', 'd', ' '],
      ['a', 'b', 'c', 'd', 1],
      null,
      Object.assign(new Array(5), { 0: 'a', 1: 'b', 2: 'c', 3: 'd' }),
    ];

    for (const ids of invalid) {
      expect(() => scheduleNextMatch(ids as string[], [])).toThrow(RangeError);
      expect(() => enumerateMatchups(ids as string[])).toThrow(RangeError);
    }
  });

  it('rejects malformed, duplicate, unordered, or mixed-session history', () => {
    const first = complete(enumerateMatchups(players)[0], 1);
    const bad: unknown[] = [
      null,
      {},
      { ...first, status: 'published' },
      { ...first, teamA: ['a', 'a'] },
      { ...first, teamB: first.teamA },
      { ...first, restingPlayerIds: ['a', 'f'] },
      { ...first, restingPlayerIds: [] },
      { ...first, sequence: 0 },
      { ...first, sequence: 1.5 },
      { ...first, id: '' },
      { ...first, result: { scores: { teamA: 9, teamB: 9 } } },
    ];

    for (const match of bad) {
      expect(() => scheduleNextMatch(players, [match as CompletedMatch])).toThrow(TypeError);
    }

    expect(() => scheduleNextMatch(players, null as unknown as CompletedMatch[])).toThrow(
      TypeError,
    );
    expect(() => scheduleNextMatch(players, [first, first])).toThrow(TypeError);
    expect(() => scheduleNextMatch(players, [complete(first, 2), first])).toThrow(TypeError);
    expect(() =>
      scheduleNextMatch(players, [first, { ...complete(first, 2), sessionId: 'other' }]),
    ).toThrow(TypeError);
  });

  it('prioritizes previous resters and underplayed players after unfair history', () => {
    const first = enumerateMatchups(players)[0];
    const history = Array.from({ length: 10 }, (_, i) => complete(first, i + 1));
    const next = scheduleNextMatch(players, history);

    expect([...next.teamA, ...next.teamB]).toEqual(expect.arrayContaining(['e', 'f']));
    expect(next.explanation.priority[0]).toBe(0);
    expect(next.explanation.appearancesBefore).toEqual({ a: 10, b: 10, c: 10, d: 10, e: 0, f: 0 });
    expect(next.explanation.partnerCountsBefore).toEqual([0, 0]);
  });

  it('uses historical encounters while allowing supported roster changes', () => {
    const history = simulate(players, 8);
    const ids = ['a', 'b', 'c', 'd', 'g'];
    const next = scheduleNextMatch(ids, history);

    expect([...next.teamA, ...next.teamB, ...next.restingPlayerIds].sort()).toEqual(ids);
    expect([...next.teamA, ...next.teamB]).toContain('g');
    expect(next.explanation.appearancesBefore['g']).toBe(0);
  });

  it('uses collision-safe keys for arbitrary stable IDs', () => {
    const ids = ['a|b', 'a', 'b|c', 'c', '__proto__', '"'];

    expect(new Set(enumerateMatchups(ids).map(matchupKey)).size).toBe(45);
    expect(scheduleNextMatch(ids, []).explanation.appearancesBefore['__proto__']).toBe(0);
  });
});
