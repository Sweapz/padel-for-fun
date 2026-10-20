import type { EndedSession, Player } from './models';
import type { SessionDocument } from './session-workflow';
import { sessionStandings } from './statistics';
import { SESSION_RESULT_POINTS, type SessionRankingPolicy } from './rules';

export interface ClubhouseStanding {
  readonly player: Player;
  readonly sessions: number;
  readonly sessionWins: number;
  readonly averageSessionRank: number;
  readonly points: number;
  readonly played: number;
  readonly average: number | null;
  readonly resultAverage: number | null;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
}

/** Newest finished sessions first, independent of storage order. */
export function previousSessions(
  documents: readonly SessionDocument[],
): readonly SessionDocument[] {
  return documents
    .filter(
      (doc): doc is SessionDocument & { session: EndedSession } => doc.session.status === 'ended',
    )
    .sort(
      (a, b) =>
        Date.parse(b.session.endedAt) - Date.parse(a.session.endedAt) ||
        a.session.id.localeCompare(b.session.id),
    );
}

/** Recalculate every session place from raw history. Each played session has equal weight. */
export function clubhouseStandings(
  players: readonly Player[],
  documents: readonly SessionDocument[],
  policy: SessionRankingPolicy = SESSION_RESULT_POINTS,
): readonly ClubhouseStanding[] {
  const finished = previousSessions(documents);
  const profiles = new Map<string, Player>();
  const placements = new Map<string, { sum: number; sessions: number; wins: number }>();

  for (const doc of finished) {
    const standings = sessionStandings(doc.players, doc.session.history, policy);

    for (const row of standings) {
      if (row.rank === null) continue;

      const totals = placements.get(row.player.id) ?? { sum: 0, sessions: 0, wins: 0 };
      placements.set(row.player.id, {
        sum: totals.sum + row.rank,
        sessions: totals.sessions + 1,
        wins: totals.wins + Number(row.rank === 1),
      });
    }

    for (const player of doc.players) {
      if (!profiles.has(player.id)) profiles.set(player.id, player);
    }
  }

  // Prefer current names while retaining archived players found only in history.
  for (const player of players) profiles.set(player.id, player);

  const history = finished.flatMap((doc) => doc.session.history);

  return sessionStandings([...profiles.values()], history, policy)
    .filter((row) => row.played > 0)
    .map((row): ClubhouseStanding => {
      const placement = placements.get(row.player.id)!;

      return {
        player: row.player,
        sessions: placement.sessions,
        sessionWins: placement.wins,
        averageSessionRank: placement.sum / placement.sessions,
        points: row.points,
        played: row.played,
        average: row.average,
        resultAverage: row.resultAverage,
        wins: row.wins,
        losses: row.losses,
        ties: row.ties,
      };
    })
    .sort(
      (a, b) =>
        a.averageSessionRank - b.averageSessionRank ||
        a.player.name.localeCompare(b.player.name) ||
        a.player.id.localeCompare(b.player.id),
    );
}
