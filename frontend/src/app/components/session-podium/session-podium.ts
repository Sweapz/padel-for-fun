import { Component, computed, input } from '@angular/core';
import type { PlayerStanding } from '../../../domain/statistics';

@Component({
  selector: 'app-session-podium',
  templateUrl: './session-podium.html',
  styleUrl: './session-podium.css',
})
export class SessionPodium {
  readonly rows = input.required<readonly PlayerStanding[]>();

  readonly places = computed(() =>
    [1, 2, 3].map((rank) => ({
      rank,
      players: this.rows()
        .filter((row) => row.rank === rank)
        .map((row) => row.player),
    })),
  );
  readonly hasResults = computed(() => this.rows().some((row) => row.rank !== null));
}
