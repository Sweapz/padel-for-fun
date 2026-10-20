import { DecimalPipe } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ClubhouseStanding } from '../../../domain/clubhouse';
import { SESSION_RESULT_POINTS } from '../../../domain/rules';

type NumericColumn = Exclude<keyof ClubhouseStanding, 'player'>;
type SortKey = NumericColumn | 'player';
type Direction = 'ascending' | 'descending';

@Component({
  selector: 'app-clubhouse-leaderboard',
  imports: [DecimalPipe, RouterLink],
  templateUrl: './clubhouse-leaderboard.html',
  styleUrl: './clubhouse-leaderboard.css',
})
export class ClubhouseLeaderboard {
  readonly rows = input.required<readonly ClubhouseStanding[]>();
  readonly resultPoints = SESSION_RESULT_POINTS;

  readonly infoOpen = signal(false);

  readonly sortKey = signal<SortKey>('averageSessionRank');
  readonly direction = signal<Direction>('ascending');

  readonly columns: readonly {
    key: NumericColumn;
    label: string;
    average?: boolean;
    ascending?: boolean;
  }[] = [
    { key: 'averageSessionRank', label: 'Avg place', average: true, ascending: true },
    { key: 'resultAverage', label: 'Result avg', average: true },
    { key: 'average', label: 'Point avg', average: true },
    { key: 'points', label: 'Points' },
    { key: 'sessions', label: 'Sessions' },
    { key: 'sessionWins', label: 'Session wins' },
    { key: 'played', label: 'Matches' },
    { key: 'wins', label: 'Match wins' },
    { key: 'ties', label: 'Match draws' },
    { key: 'losses', label: 'Match losses', ascending: true },
  ];

  readonly sortedRows = computed(() => {
    const key = this.sortKey();
    const multiplier = this.direction() === 'ascending' ? 1 : -1;

    return [...this.rows()].sort((a, b) => {
      let comparison: number;

      if (key === 'player') {
        comparison = a.player.name.localeCompare(b.player.name);
      } else {
        const first = a[key];
        const second = b[key];

        // Missing values stay last in both directions.
        if (first === null || second === null) {
          if (first !== second) return first === null ? 1 : -1;

          comparison = 0;
        } else comparison = first - second;
      }

      return (
        comparison * multiplier ||
        a.averageSessionRank - b.averageSessionRank ||
        a.player.name.localeCompare(b.player.name) ||
        a.player.id.localeCompare(b.player.id)
      );
    });
  });

  sort(key: SortKey): void {
    if (key === this.sortKey()) {
      this.direction.update((direction) =>
        direction === 'ascending' ? 'descending' : 'ascending',
      );
      return;
    }

    this.sortKey.set(key);
    this.direction.set(
      key === 'player' || this.columns.find((column) => column.key === key)?.ascending
        ? 'ascending'
        : 'descending',
    );
  }
}
