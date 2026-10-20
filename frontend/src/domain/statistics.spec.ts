import { describe, expect, it } from 'vitest';
import type { CompletedMatch, Team } from './models';
import { compareSessionPerformance, sessionStandings } from './statistics';

const players = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, name: id.toUpperCase() }));

function match(id: string, teamA: Team, teamB: Team, score: number): CompletedMatch {
  const now = '2026-10-20T12:00:00Z';

  return {
    id,
    sessionId: 'session',
    sequence: Number(id) + 1,
    status: 'completed',
    teamA,
    teamB,
    restingPlayerIds: players
      .filter((player) => ![...teamA, ...teamB].includes(player.id))
      .map((player) => player.id),
    publishedAt: now,
    result: { scores: { teamA: score, teamB: 16 - score }, confirmedAt: now },
  };
}

describe('Session ranking', () => {
  it('ranks six narrow wins above three large wins and three narrow losses', () => {
    const history = [
      ...Array.from({ length: 3 }, (_, i) => match(String(i), ['a', 'c'], ['b', 'd'], 9)),
      ...Array.from({ length: 3 }, (_, i) => match(String(i + 3), ['a', 'c'], ['d', 'e'], 9)),
      ...Array.from({ length: 3 }, (_, i) => match(String(i + 6), ['b', 'c'], ['d', 'e'], 16)),
    ];

    const rows = sessionStandings(players, history);
    const unbeaten = rows.find((row) => row.player.id === 'a')!;
    const split = rows.find((row) => row.player.id === 'b')!;

    expect(unbeaten).toMatchObject({ wins: 6, played: 6, average: 9, resultAverage: 2 });
    expect(split).toMatchObject({ wins: 3, losses: 3, played: 6, average: 11.5, resultAverage: 1 });
    expect(unbeaten.rank!).toBeLessThan(split.rank!);
  });

  it('breaks equal result averages with padel average and shares exact ties using competition places', () => {
    const rows = sessionStandings(players, [
      match('0', ['a', 'c'], ['d', 'e'], 9),
      match('1', ['b', 'f'], ['d', 'e'], 10),
    ]);

    expect(rows.map((row) => [row.player.id, row.rank])).toEqual([
      ['b', 1],
      ['f', 1],
      ['a', 3],
      ['c', 3],
      ['d', 5],
      ['e', 5],
    ]);
  });

  it('uses per-match result averages for unequal appearances and leaves unplayed players unranked', () => {
    const rows = sessionStandings(players, [
      match('0', ['a', 'c'], ['d', 'e'], 9),
      match('1', ['a', 'b'], ['d', 'e'], 9),
    ]);

    expect(rows.find((row) => row.player.id === 'a')).toMatchObject({
      resultPoints: 4,
      played: 2,
      rank: 1,
    });
    expect(rows.find((row) => row.player.id === 'b')).toMatchObject({
      resultPoints: 2,
      played: 1,
      rank: 1,
    });
    expect(rows.find((row) => row.player.id === 'f')).toMatchObject({
      played: 0,
      rank: null,
      resultAverage: null,
    });
  });

  it('awards draws one result point and treats equivalent ratios as equal places', () => {
    const history = [
      match('0', ['a', 'c'], ['d', 'e'], 8),
      match('1', ['b', 'c'], ['d', 'e'], 16),
      match('2', ['b', 'c'], ['d', 'e'], 0),
    ];
    const rows = sessionStandings(players, history);

    expect(rows.find((row) => row.player.id === 'a')).toMatchObject({
      resultAverage: 1,
      average: 8,
      rank: 1,
    });
    expect(rows.find((row) => row.player.id === 'b')).toMatchObject({
      resultAverage: 1,
      average: 8,
      rank: 1,
    });
  });

  it('does not turn distinct result averages into a tie through display rounding', () => {
    const base = sessionStandings(players, [match('0', ['a', 'c'], ['d', 'e'], 8)])[0];
    const first = { ...base, played: 1001, resultPoints: 1000, points: 8008 };
    const second = { ...base, played: 1000, resultPoints: 999, points: 9000 };

    expect((first.resultPoints / first.played).toFixed(2)).toBe(
      (second.resultPoints / second.played).toFixed(2),
    );
    expect(compareSessionPerformance(first, second)).toBeLessThan(0);
  });
});
