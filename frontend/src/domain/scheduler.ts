import type { CompletedMatch, PlayerId, Team } from './models';
import { validateScores } from './scoring';
import {
  isSupportedPlayerCount,
  PLAYERS_PER_MATCH,
  PLAYERS_PER_TEAM,
  SUPPORTED_PLAYER_COUNTS,
} from './rules';

export interface Matchup {
  readonly teamA: Team;
  readonly teamB: Team;
  readonly restingPlayerIds: readonly PlayerId[];
}

export interface ScheduledMatch extends Matchup {
  readonly explanation: {
    readonly candidateCount: number;
    /** Lexicographically minimized, in the order documented in docs/SCHEDULER.md. */
    readonly priority: readonly number[];
    readonly appearancesBefore: Readonly<Record<PlayerId, number>>;
    readonly restsBefore: Readonly<Record<PlayerId, number>>;
    readonly partnerCountsBefore: readonly number[];
    readonly opponentCountsBefore: readonly number[];
  };
}

const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const pairKey = (a: string, b: string): string => JSON.stringify([a, b].sort(compareIds));

const count = (counts: ReadonlyMap<string, number>, key: string): number => counts.get(key) ?? 0;

const increment = (counts: Map<string, number>, key: string): void => {
  counts.set(key, count(counts, key) + 1);
};

function validIds(ids: readonly unknown[]): ids is readonly string[] {
  return (
    Array.from(ids).every((id) => typeof id === 'string' && id.trim().length > 0) &&
    new Set(ids).size === ids.length
  );
}

function roster(playerIds: readonly PlayerId[]): PlayerId[] {
  if (
    !Array.isArray(playerIds) ||
    !isSupportedPlayerCount(playerIds.length) ||
    !validIds(playerIds)
  ) {
    throw new RangeError(
      `Expected ${SUPPORTED_PLAYER_COUNTS.join(' or ')} distinct nonblank player IDs.`,
    );
  }

  return [...playerIds].sort(compareIds);
}

/** Canonical teams make player order and team-side swaps equivalent. */
export function matchupKey(match: Pick<Matchup, 'teamA' | 'teamB'>): string {
  return JSON.stringify(
    [[...match.teamA].sort(compareIds), [...match.teamB].sort(compareIds)].sort((a, b) =>
      compareIds(JSON.stringify(a), JSON.stringify(b)),
    ),
  );
}

/** C(n,4) subsets, each with three partitions: 15 or 45 unique matchups. */
export function enumerateMatchups(playerIds: readonly PlayerId[]): readonly Matchup[] {
  const ids = roster(playerIds);
  const matches: Matchup[] = [];

  for (let a = 0; a < ids.length - 3; a++) {
    for (let b = a + 1; b < ids.length - 2; b++) {
      for (let c = b + 1; c < ids.length - 1; c++) {
        for (let d = c + 1; d < ids.length; d++) {
          const [w, x, y, z] = [ids[a], ids[b], ids[c], ids[d]];
          const rest = ids.filter((id) => ![w, x, y, z].includes(id));

          matches.push(
            { teamA: [w, x], teamB: [y, z], restingPlayerIds: rest },
            { teamA: [w, y], teamB: [x, z], restingPlayerIds: rest },
            { teamA: [w, z], teamB: [x, y], restingPlayerIds: rest },
          );
        }
      }
    }
  }

  return matches;
}

function partnerKeys(match: Matchup): string[] {
  return [pairKey(...match.teamA), pairKey(...match.teamB)];
}

function opponentKeys(match: Matchup): string[] {
  return match.teamA.flatMap((a) => match.teamB.map((b) => pairKey(a, b)));
}

function validateHistory(history: readonly CompletedMatch[]): void {
  if (!Array.isArray(history)) throw new TypeError('History must be an ordered array.');

  const matchIds = new Set<string>();
  let previousSequence = 0;
  let sessionId: string | undefined;

  for (const match of history) {
    if (
      !match ||
      match.status !== 'completed' ||
      !Array.isArray(match.teamA) ||
      !Array.isArray(match.teamB) ||
      !Array.isArray(match.restingPlayerIds) ||
      match.teamA.length !== PLAYERS_PER_TEAM ||
      match.teamB.length !== PLAYERS_PER_TEAM ||
      !isSupportedPlayerCount(match.restingPlayerIds.length + PLAYERS_PER_MATCH) ||
      !validIds([...match.teamA, ...match.teamB, ...match.restingPlayerIds]) ||
      typeof match.id !== 'string' ||
      !match.id.trim() ||
      matchIds.has(match.id) ||
      typeof match.sessionId !== 'string' ||
      !match.sessionId.trim() ||
      (sessionId !== undefined && match.sessionId !== sessionId) ||
      !Number.isSafeInteger(match.sequence) ||
      match.sequence <= previousSequence ||
      !match.result ||
      !validateScores(match.result.scores?.teamA, match.result.scores?.teamB).valid
    ) {
      throw new TypeError(
        'Invalid completed history: check IDs, teams, rests, scores, session, and sequence order.',
      );
    }

    matchIds.add(match.id);
    previousSequence = match.sequence;
    sessionId = match.sessionId;
  }
}

function comparePriority(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }

  return 0;
}

/** Pure one-step heuristic. Caller must retain an already published match. */
export function scheduleNextMatch(
  playerIds: readonly PlayerId[],
  history: readonly CompletedMatch[],
): ScheduledMatch {
  const ids = roster(playerIds);

  validateHistory(history);

  const appearances = new Map<string, number>();
  const rests = new Map<string, number>();
  const partners = new Map<string, number>();
  const opponents = new Map<string, number>();
  const exact = new Map<string, number>();

  for (const match of history) {
    for (const id of [...match.teamA, ...match.teamB]) increment(appearances, id);

    for (const id of match.restingPlayerIds) increment(rests, id);

    for (const key of partnerKeys(match)) increment(partners, key);

    for (const key of opponentKeys(match)) increment(opponents, key);

    increment(exact, matchupKey(match));
  }

  const previousRests = new Set(history.at(-1)?.restingPlayerIds ?? []);
  const candidates = enumerateMatchups(ids);
  const ranked = candidates.map((match) => {
    const playing = new Set([...match.teamA, ...match.teamB]);
    const after = ids.map((id) => count(appearances, id) + Number(playing.has(id)));
    const partnerCounts = partnerKeys(match).map((key) => count(partners, key));
    const opponentCounts = opponentKeys(match).map((key) => count(opponents, key));
    const priority = [
      match.restingPlayerIds.filter((id) => previousRests.has(id)).length,
      Math.max(...after) - Math.min(...after),
      after.reduce((sum, n) => sum + n * n, 0),
      partnerCounts.filter((n) => n > 0).length,
      partnerCounts.reduce((sum, n) => sum + 2 * n + 1, 0),
      opponentCounts.reduce((sum, n) => sum + 2 * n + 1, 0),
      count(exact, matchupKey(match)),
    ];

    return { match, priority, partnerCounts, opponentCounts };
  });

  ranked.sort(
    (a, b) =>
      comparePriority(a.priority, b.priority) ||
      compareIds(matchupKey(a.match), matchupKey(b.match)),
  );

  const best = ranked[0];

  return {
    ...best.match,
    explanation: {
      candidateCount: candidates.length,
      priority: best.priority,
      appearancesBefore: Object.fromEntries(ids.map((id) => [id, count(appearances, id)])),
      restsBefore: Object.fromEntries(ids.map((id) => [id, count(rests, id)])),
      partnerCountsBefore: best.partnerCounts,
      opponentCountsBefore: best.opponentCounts,
    },
  };
}
