import type { CompletedMatch, Player } from './models';
import { SESSION_RESULT_POINTS, type SessionRankingPolicy } from './rules';

export interface PlayerStanding {
  readonly player: Player;
  readonly points: number;
  readonly played: number;
  readonly average: number | null;
  readonly resultPoints: number;
  readonly resultAverage: number | null;
  readonly rank: number | null;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly rests: number;
  readonly partners: Readonly<Record<string, number>>;
  readonly opponents: Readonly<Record<string, number>>;
}

/** Compare exact ratios before display rounding. Names never decide a session place. */
export function compareSessionPerformance(a: PlayerStanding, b: PlayerStanding): number {
  if (!a.played || !b.played) return Number(!!b.played) - Number(!!a.played);

  return (
    b.resultPoints * a.played - a.resultPoints * b.played ||
    b.points * a.played - a.points * b.played
  );
}

/** All totals come from completed history. Unplayed players have no points-per-match value. */
export function sessionStandings(
  players: readonly Player[],
  history: readonly CompletedMatch[],
  policy: SessionRankingPolicy = SESSION_RESULT_POINTS,
): readonly PlayerStanding[] {
  const rows = players
    .map((player): PlayerStanding => {
      let points = 0,
        played = 0,
        wins = 0,
        losses = 0,
        ties = 0,
        rests = 0;
      const partners = new Map<string, number>();
      const opponents = new Map<string, number>();

      for (const match of history) {
        if (match.restingPlayerIds.includes(player.id)) rests++;

        const side = match.teamA.includes(player.id)
          ? 'teamA'
          : match.teamB.includes(player.id)
            ? 'teamB'
            : null;

        if (!side) continue;

        const other = side === 'teamA' ? 'teamB' : 'teamA';
        const earned = match.result.scores[side],
          conceded = match.result.scores[other];

        played++;
        points += earned;

        if (earned > conceded) wins++;
        else if (earned < conceded) losses++;
        else ties++;

        for (const id of match[side])
          if (id !== player.id) partners.set(id, (partners.get(id) ?? 0) + 1);

        for (const id of match[other]) opponents.set(id, (opponents.get(id) ?? 0) + 1);
      }

      const resultPoints = wins * policy.win + ties * policy.draw + losses * policy.loss;

      return {
        player,
        points,
        played,
        average: played ? points / played : null,
        resultPoints,
        resultAverage: played ? resultPoints / played : null,
        rank: null,
        wins,
        losses,
        ties,
        rests,
        partners: Object.fromEntries(partners),
        opponents: Object.fromEntries(opponents),
      };
    })
    .sort(
      (a, b) =>
        compareSessionPerformance(a, b) ||
        a.player.name.localeCompare(b.player.name) ||
        a.player.id.localeCompare(b.player.id),
    );

  let rank: number | null = null;

  return rows.map((row, index) => {
    if (row.played && (index === 0 || compareSessionPerformance(row, rows[index - 1]) !== 0)) {
      rank = index + 1;
    }

    return { ...row, rank: row.played ? rank : null };
  });
}
