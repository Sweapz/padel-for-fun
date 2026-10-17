import type { CompletedMatch } from '../models';
import type { Matchup } from '../scheduler';
import { MATCH_POINTS } from '../rules';

export type NextMatch = (ids: readonly string[], history: readonly CompletedMatch[]) => Matchup;

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const pair = (a: string, b: string) => JSON.stringify([a, b].sort(compare));
const get = (counts: ReadonlyMap<string, number>, key: string) => counts.get(key) ?? 0;

/** Independent rest-subset enumeration, not the production four-player-subset loops. */
export function legalAssignments(ids: readonly string[]): Matchup[] {
  const sorted = [...ids].sort(compare);
  const rests =
    sorted.length === 5
      ? sorted.map((id) => [id])
      : sorted.flatMap((a, i) => sorted.slice(i + 1).map((b) => [a, b]));

  return rests.flatMap((restingPlayerIds) => {
    const [a, b, c, d] = sorted.filter((id) => !restingPlayerIds.includes(id));

    return [
      { teamA: [a, b] as const, teamB: [c, d] as const, restingPlayerIds },
      { teamA: [a, c] as const, teamB: [b, d] as const, restingPlayerIds },
      { teamA: [a, d] as const, teamB: [b, c] as const, restingPlayerIds },
    ];
  });
}

export function assignmentKey(match: Matchup): string {
  return JSON.stringify(
    [[...match.teamA].sort(compare), [...match.teamB].sort(compare)].sort((a, b) =>
      compare(JSON.stringify(a), JSON.stringify(b)),
    ),
  );
}

export function completed(match: Matchup, index: number): CompletedMatch {
  const now = '2026-10-17T10:00:00.000Z';

  return {
    ...match,
    id: `audit-${index}`,
    sessionId: 'audit',
    sequence: index,
    status: 'completed',
    publishedAt: now,
    result: { scores: { teamA: 0, teamB: MATCH_POINTS }, confirmedAt: now },
  };
}

export function countsFor(ids: readonly string[], history: readonly CompletedMatch[]) {
  const appearances = new Map(ids.map((id) => [id, 0]));
  const partners = new Map<string, number>();
  const opponents = new Map<string, number>();
  const exact = new Map<string, number>();
  const pairs = ids.flatMap((a, i) => ids.slice(i + 1).map((b) => pair(a, b)));

  for (const match of history) {
    for (const id of [...match.teamA, ...match.teamB])
      appearances.set(id, get(appearances, id) + 1);

    for (const team of [match.teamA, match.teamB]) {
      const key = pair(...team);
      partners.set(key, get(partners, key) + 1);
    }

    for (const a of match.teamA) {
      for (const b of match.teamB) {
        const key = pair(a, b);
        opponents.set(key, get(opponents, key) + 1);
      }
    }

    const key = assignmentKey(match);
    exact.set(key, get(exact, key) + 1);
  }

  return { appearances, partners, opponents, exact, pairs };
}

const spread = (values: readonly number[]) => Math.max(...values) - Math.min(...values);
const squares = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value * value, 0);

export function evaluateAssignments(ids: readonly string[], history: readonly CompletedMatch[]) {
  const counts = countsFor(ids, history);
  const previousRests = history.at(-1)?.restingPlayerIds ?? [];

  return legalAssignments(ids).map((match) => {
    const playing = [...match.teamA, ...match.teamB];
    const after = ids.map((id) => get(counts.appearances, id) + Number(playing.includes(id)));
    const partnerKeys = [pair(...match.teamA), pair(...match.teamB)];
    const partnerCounts = partnerKeys.map((key) => get(counts.partners, key));
    const partnerAfter = counts.pairs.map(
      (key) => get(counts.partners, key) + Number(partnerKeys.includes(key)),
    );
    const opponentCounts = match.teamA.flatMap((a) =>
      match.teamB.map((b) => get(counts.opponents, pair(a, b))),
    );
    const fairness = [
      match.restingPlayerIds.filter((id) => previousRests.includes(id)).length,
      spread(after),
      squares(after),
    ];
    const partnership = [
      partnerCounts.filter((n) => n > 0).length,
      partnerCounts.reduce((sum, n) => sum + 2 * n + 1, 0),
    ];
    const opposition = opponentCounts.reduce((sum, n) => sum + 2 * n + 1, 0);

    return {
      match,
      fairness,
      partnership,
      opposition,
      partnerSpread: spread(partnerAfter),
      exact: get(counts.exact, assignmentKey(match)),
      key: assignmentKey(match),
    };
  });
}

export function compareVectors(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }

  return 0;
}

/** Frozen reference to the original seven-priority policy, independently calculated. */
export const originalPolicy: NextMatch = (ids, history) => {
  const ranked = evaluateAssignments(ids, history).map((candidate) => ({
    ...candidate,
    priority: [
      ...candidate.fairness,
      ...candidate.partnership,
      candidate.opposition,
      candidate.exact,
    ],
  }));
  ranked.sort((a, b) => compareVectors(a.priority, b.priority) || compare(a.key, b.key));

  return ranked[0].match;
};

/** Experiment: break otherwise-equal partnership-cost ties by projected pair-count spread. */
export const spreadTiePolicy: NextMatch = (ids, history) => {
  const ranked = evaluateAssignments(ids, history).map((candidate) => ({
    ...candidate,
    priority: [
      ...candidate.fairness,
      ...candidate.partnership,
      candidate.partnerSpread,
      candidate.opposition,
      candidate.exact,
    ],
  }));
  ranked.sort((a, b) => compareVectors(a.priority, b.priority) || compare(a.key, b.key));

  return ranked[0].match;
};

export function randomSource(seed: number): () => number {
  let value = seed >>> 0;

  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

export function randomHistory(
  ids: readonly string[],
  length: number,
  seed: number,
  avoidRestRepeats: boolean,
): CompletedMatch[] {
  const random = randomSource(seed);
  const candidates = legalAssignments(ids);
  const history: CompletedMatch[] = [];

  while (history.length < length) {
    const lastRest = history.at(-1)?.restingPlayerIds ?? [];
    const choices = avoidRestRepeats
      ? candidates.filter((match) => match.restingPlayerIds.every((id) => !lastRest.includes(id)))
      : candidates;
    history.push(completed(choices[Math.floor(random() * choices.length)], history.length + 1));
  }

  return history;
}

export function metrics(ids: readonly string[], history: readonly CompletedMatch[]) {
  const counts = countsFor(ids, history);
  const appearances = ids.map((id) => get(counts.appearances, id));
  const frequencies = (values: ReadonlyMap<string, number>) => {
    const all = counts.pairs.map((key) => get(values, key));

    return {
      min: Math.min(...all),
      max: Math.max(...all),
      spread: spread(all),
      squares: squares(all),
      covered: all.filter((n) => n > 0).length,
    };
  };
  const consecutiveRests = history.reduce(
    (sum, match, i) =>
      sum +
      match.restingPlayerIds.filter((id) => history[i - 1]?.restingPlayerIds.includes(id)).length,
    0,
  );

  return {
    appearances,
    appearanceSpread: spread(appearances),
    consecutiveRests,
    partners: frequencies(counts.partners),
    opponents: frequencies(counts.opponents),
    repeatedExact: history.length - counts.exact.size,
  };
}

export function simulate(
  next: NextMatch,
  ids: readonly string[],
  length: number,
  prefix: readonly CompletedMatch[] = [],
) {
  const history = [...prefix];

  while (history.length < length) {
    history.push(completed(next(ids, history), history.length + 1));
  }

  return history;
}
