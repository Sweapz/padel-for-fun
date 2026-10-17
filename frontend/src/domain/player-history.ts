import type { Session } from './models';
import type { SessionDocument } from './session-workflow';

export interface PlayerSessionSummary {
  readonly sessionId: string;
  readonly createdAt: string;
  readonly status: Session['status'];
  readonly playerNames: readonly string[];
  readonly points: number;
  readonly played: number;
  readonly average: number | null;
  readonly bestGame: number | null;
}

/** Include roster membership even with no completed appearance, so every linked session is accessible. */
export function playerSessionHistory(
  playerId: string,
  documents: readonly SessionDocument[],
): readonly PlayerSessionSummary[] {
  return documents
    .filter((doc) => doc.players.some((player) => player.id === playerId))
    .map((doc) => {
      const scores = doc.session.history.flatMap((match) => {
        if (match.teamA.includes(playerId)) return [match.result.scores.teamA];

        if (match.teamB.includes(playerId)) return [match.result.scores.teamB];

        return [];
      });
      const points = scores.reduce((total, score) => total + score, 0);

      return {
        sessionId: doc.session.id,
        createdAt: doc.session.createdAt,
        status: doc.session.status,
        playerNames: doc.players.map((player) => player.name),
        points,
        played: scores.length,
        average: scores.length ? points / scores.length : null,
        bestGame: scores.length ? Math.max(...scores) : null,
      };
    })
    .sort(
      (a, b) =>
        Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
        (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0),
    );
}

export function playerHistoricalStats(history: readonly PlayerSessionSummary[]) {
  const playedSessions = history.filter((session) => session.played > 0);
  const points = playedSessions.reduce((total, session) => total + session.points, 0);
  const played = playedSessions.reduce((total, session) => total + session.played, 0);

  return {
    sessionsPlayed: playedSessions.length,
    matchesPlayed: played,
    points,
    averagePointsPerSession: playedSessions.length ? points / playedSessions.length : null,
    averagePointsPerMatch: played ? points / played : null,
    maxSessionPoints: playedSessions.length
      ? Math.max(...playedSessions.map((session) => session.points))
      : null,
    maxGamePoints: playedSessions.length
      ? Math.max(...playedSessions.map((session) => session.bestGame!))
      : null,
  };
}
