import { DecimalPipe } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import type { CompletedMatch, Player } from '../../../domain/models';
import { sessionStandings } from '../../../domain/statistics';
import { SESSION_RESULT_POINTS } from '../../../domain/rules';

@Component({
  selector: 'app-standings',
  imports: [DecimalPipe],
  templateUrl: './standings.html',
  styleUrl: './standings.css',
})
export class Standings {
  readonly players = input.required<readonly Player[]>();
  readonly history = input.required<readonly CompletedMatch[]>();
  readonly finished = input(false);
  readonly resultPoints = SESSION_RESULT_POINTS;

  readonly infoOpen = signal(false);

  readonly rows = computed(() => sessionStandings(this.players(), this.history()));
  readonly leaders = computed(() =>
    this.rows()
      .filter((row) => row.rank === 1)
      .map((row) => row.player.name)
      .join(' & '),
  );
  readonly leaderLabel = computed(() => {
    if (!this.finished()) return 'Currently leading';

    return this.rows().filter((row) => row.rank === 1).length === 1
      ? 'Session winner'
      : 'Joint session winners';
  });
}
