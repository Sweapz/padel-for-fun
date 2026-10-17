import type {
  ActiveRoster,
  ActiveSession,
  Player,
  PublishedMatch,
  Session,
  TeamScores,
} from './models';
import { scheduleNextMatch } from './scheduler';
import { validateScores } from './scoring';
import {
  COURT_COUNT,
  isSupportedPlayerCount,
  MATCH_POINTS,
  SUPPORTED_PLAYER_COUNTS,
} from './rules';

export interface SessionDocument {
  readonly players: readonly Player[];
  readonly session: Session;
}

export function validatePlayers(players: readonly Player[]): void {
  if (
    !isSupportedPlayerCount(players.length) ||
    players.some((p) => !p.id.trim() || !p.name.trim()) ||
    new Set(players.map((p) => p.id)).size !== players.length ||
    new Set(players.map((p) => p.name.trim().toLowerCase())).size !== players.length
  ) {
    throw new Error(`Enter ${SUPPORTED_PLAYER_COUNTS.join(' or ')} distinct player names.`);
  }
}

function publish(session: Session, matchId: string, now: string): PublishedMatch {
  const { teamA, teamB, restingPlayerIds } = scheduleNextMatch(
    session.activePlayerIds,
    session.history,
  );

  return {
    id: matchId,
    sessionId: session.id,
    sequence: session.history.length + 1,
    status: 'published',
    teamA,
    teamB,
    restingPlayerIds,
    publishedAt: now,
  };
}

export function createSession(
  players: readonly Player[],
  sessionId: string,
  matchId: string,
  now: string,
): SessionDocument {
  validatePlayers(players);

  const session: ActiveSession = {
    id: sessionId,
    activePlayerIds: players.map((p) => p.id) as unknown as ActiveRoster,
    courtCount: COURT_COUNT,
    createdAt: now,
    history: [],
    status: 'active',
    activeMatch: null,
  };

  return {
    players: players.map((p) => ({ ...p, name: p.name.trim() })),
    session: { ...session, activeMatch: publish(session, matchId, now) },
  };
}

/** A retry for the same match/result is a no-op; different scores require an audited correction. */
export function confirmResult(
  session: Session,
  expectedMatchId: string,
  scores: TeamScores,
  nextMatchId: string,
  now: string,
): Session {
  const valid = validateScores(scores.teamA, scores.teamB);

  if (!valid.valid) {
    throw new Error(
      `Scores must be whole numbers from 0 to ${MATCH_POINTS} and total ${MATCH_POINTS}.`,
    );
  }

  const saved = session.history.find((m) => m.id === expectedMatchId);

  if (saved) {
    if (saved.result.scores.teamA !== scores.teamA || saved.result.scores.teamB !== scores.teamB) {
      throw new Error(
        'This match already has a different result. Score corrections are not available yet.',
      );
    }

    return session;
  }

  if (session.status !== 'active' || session.activeMatch?.id !== expectedMatchId) {
    throw new Error('This match is no longer active. Review the current session.');
  }

  if (nextMatchId === expectedMatchId || session.history.some((m) => m.id === nextMatchId)) {
    throw new Error('The next match must have a new ID.');
  }

  const updated: ActiveSession = {
    ...session,
    history: [
      ...session.history,
      {
        ...session.activeMatch,
        status: 'completed',
        result: { scores: valid.scores, confirmedAt: now },
      },
    ],
    activeMatch: null,
  };

  return { ...updated, activeMatch: publish(updated, nextMatchId, now) };
}

export function endSession(session: Session, now: string): Session {
  if (session.status === 'ended') return session;

  return { ...session, status: 'ended', activeMatch: null, endedAt: now };
}
