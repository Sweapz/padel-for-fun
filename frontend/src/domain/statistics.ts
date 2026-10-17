import type { CompletedMatch, Player } from './models';

export interface PlayerStanding {
  readonly player: Player;
  readonly points: number;
  readonly played: number;
  readonly average: number | null;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly rests: number;
  readonly partners: Readonly<Record<string, number>>;
  readonly opponents: Readonly<Record<string, number>>;
}

/** All totals come from completed history. Unplayed players have no points-per-match value. */
export function sessionStandings(
  players: readonly Player[],
  history: readonly CompletedMatch[],
): readonly PlayerStanding[] {
  return players
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

      return {
        player,
        points,
        played,
        average: played ? points / played : null,
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
        (b.average ?? -1) - (a.average ?? -1) ||
        a.player.name.localeCompare(b.player.name) ||
        a.player.id.localeCompare(b.player.id),
    );
}
