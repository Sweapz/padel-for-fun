import type { CompletedMatch, Team } from '../../frontend/src/domain/models';
import { isSupportedPlayerCount, MATCH_POINTS } from '../../frontend/src/domain/rules';
import { validateScores } from '../../frontend/src/domain/scoring';

export const SCHEDULER_VERSION = 'lexicographic-v1';
export const RULES_VERSION = 'americano-16-v1';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class DatabaseError extends Error {
  constructor(readonly code: string) {
    super('Database operation failed.');
  }
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'invalid_request', 'Expected a JSON object.');
  }

  return value as Record<string, unknown>;
}

export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value)) {
    throw new HttpError(400, 'invalid_request', 'Expected a valid identifier.');
  }

  return value.toLowerCase();
}

export type ScheduleRequest =
  | { action: 'create'; groupId: string; playerIds: string[]; requestId: string }
  | {
      action: 'confirm';
      sessionId: string;
      matchId: string;
      scoreA: number;
      scoreB: number;
      requestId: string;
    };

export function parseRequest(value: unknown): ScheduleRequest {
  const input = object(value);
  const fields =
    input.action === 'create'
      ? ['action', 'groupId', 'playerIds', 'requestId']
      : ['action', 'sessionId', 'matchId', 'scoreA', 'scoreB', 'requestId'];

  if (Object.keys(input).some((key) => !fields.includes(key))) {
    throw new HttpError(400, 'invalid_request', 'Unexpected request fields.');
  }

  const requestId = uuid(input.requestId);

  if (input.action === 'create') {
    if (!Array.isArray(input.playerIds) || !isSupportedPlayerCount(input.playerIds.length)) {
      throw new HttpError(400, 'invalid_roster', 'Choose a supported player count.');
    }

    const playerIds = input.playerIds.map(uuid);

    if (new Set(playerIds).size !== playerIds.length) {
      throw new HttpError(400, 'invalid_roster', 'Choose distinct players.');
    }

    return { action: 'create', groupId: uuid(input.groupId), playerIds, requestId };
  }

  if (input.action !== 'confirm') {
    throw new HttpError(400, 'invalid_request', 'Unknown scheduling action.');
  }

  const scores = validateScores(input.scoreA, input.scoreB);

  if (!scores.valid) {
    throw new HttpError(400, 'invalid_score', `Scores must be integers totalling ${MATCH_POINTS}.`);
  }

  return {
    action: 'confirm',
    sessionId: uuid(input.sessionId),
    matchId: uuid(input.matchId),
    requestId,
    scoreA: scores.scores.teamA,
    scoreB: scores.scores.teamB,
  };
}

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Invalid stored integer.');
  }

  return value;
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error('Invalid stored timestamp.');
  }

  return value;
}

export interface Snapshot {
  session: Record<string, unknown>;
  players: Record<string, unknown>[];
  matches: Record<string, unknown>[];
}

export function parseSnapshot(value: unknown, sessionId: string): Snapshot {
  const source = object(value);
  const session = object(source.session);

  if (
    session.id !== sessionId ||
    !Array.isArray(source.players) ||
    !Array.isArray(source.matches)
  ) {
    throw new Error('Invalid stored snapshot.');
  }

  integer(session.revision);

  return { session, players: source.players.map(object), matches: source.matches.map(object) };
}

export function snapshotRoster(snapshot: Snapshot): string[] {
  const ids = snapshot.players.filter((p) => p.is_active === true).map((p) => uuid(p.player_id));

  if (!isSupportedPlayerCount(ids.length) || new Set(ids).size !== ids.length) {
    throw new Error('Invalid stored roster.');
  }

  return ids;
}

export function completedMatch(match: Record<string, unknown>, sessionId: string): CompletedMatch {
  if (!Array.isArray(match.participants)) throw new Error('Missing stored participants.');

  const slots = new Map<string, string>();

  for (const value of match.participants) {
    const row = object(value);
    const slot = row.slot;

    if (
      typeof slot !== 'string' ||
      !['a1', 'a2', 'b1', 'b2', 'rest1', 'rest2'].includes(slot) ||
      slots.has(slot)
    ) {
      throw new Error('Invalid stored participant slot.');
    }

    slots.set(slot, uuid(row.player_id));
  }

  const team = (a: string, b: string): Team => [uuid(slots.get(a)), uuid(slots.get(b))];
  const score = validateScores(match.score_a, match.score_b);

  if (match.status !== 'completed' || match.session_id !== sessionId || !score.valid) {
    throw new Error('Invalid stored completed match.');
  }

  return {
    id: uuid(match.id),
    sessionId,
    sequence: integer(match.sequence),
    status: 'completed',
    teamA: team('a1', 'a2'),
    teamB: team('b1', 'b2'),
    restingPlayerIds: ['rest1', 'rest2'].flatMap((key) =>
      slots.has(key) ? [uuid(slots.get(key))] : [],
    ),
    publishedAt: timestamp(match.published_at),
    result: { scores: score.scores, confirmedAt: timestamp(match.confirmed_at) },
  };
}

export function assertSupportedRules(session: Record<string, unknown>): void {
  if (
    session.match_points !== MATCH_POINTS ||
    session.court_count !== 1 ||
    session.rules_version !== RULES_VERSION ||
    session.scheduler_version !== SCHEDULER_VERSION
  ) {
    throw new HttpError(409, 'unsupported_rules', 'This session uses an unsupported game version.');
  }
}
