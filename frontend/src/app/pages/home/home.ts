import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionStore } from '../../data/session-store';
import { SessionFeedback } from '../../components/session-feedback/session-feedback';
import { COURT_COUNT, MATCH_POINTS, SUPPORTED_PLAYER_COUNTS } from '../../../domain/rules';
import { APP_SETTINGS } from '../../data/runtime-settings';

@Component({
  selector: 'app-home',
  imports: [RouterLink, DatePipe, SessionFeedback],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  readonly store = inject(SessionStore);
  readonly shared = inject(APP_SETTINGS).mode === 'supabase';

  readonly matchPoints = MATCH_POINTS;
  readonly courtCount = COURT_COUNT;
  readonly playerCountRange = SUPPORTED_PLAYER_COUNTS.join('–');
  readonly playerCountOptions = SUPPORTED_PLAYER_COUNTS.join(' or ');

  playerNames(players: readonly { readonly name: string }[]): string {
    return players.map((p) => p.name).join(', ');
  }
}
