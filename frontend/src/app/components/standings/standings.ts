import { DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import type { CompletedMatch, Player } from '../../../domain/models';
import { sessionStandings } from '../../../domain/statistics';

@Component({
  selector: 'app-standings',
  imports: [DecimalPipe],
  templateUrl: './standings.html',
  styleUrl: './standings.css',
})
export class Standings {
  readonly players = input.required<readonly Player[]>();
  readonly history = input.required<readonly CompletedMatch[]>();

  readonly rows = computed(() => sessionStandings(this.players(), this.history()));
}
