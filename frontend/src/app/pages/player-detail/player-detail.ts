import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { playerHistoricalStats, playerSessionHistory } from '../../../domain/player-history';
import { SessionFeedback } from '../../components/session-feedback/session-feedback';
import { PlayerTrend } from '../../components/player-trend/player-trend';
import { SessionStore } from '../../data/session-store';

@Component({
  selector: 'app-player-detail',
  imports: [DatePipe, DecimalPipe, RouterLink, SessionFeedback, PlayerTrend],
  templateUrl: './player-detail.html',
  styleUrl: './player-detail.css',
})
export class PlayerDetail {
  readonly store = inject(SessionStore);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);

  readonly selectedTab = signal<'sessions' | 'statistics'>('sessions');
  readonly tabs = [
    { id: 'sessions', label: 'Sessions' },
    { id: 'statistics', label: 'Historical data' },
  ] as const;

  readonly player = computed(() =>
    this.store.players().find((player) => player.id === this.params()?.get('id')),
  );
  readonly history = computed(() =>
    playerSessionHistory(this.player()?.id ?? '', this.store.sessions()),
  );
  readonly recentSessions = computed(() => [...this.history()].reverse());
  readonly stats = computed(() => playerHistoricalStats(this.history()));

  navigateTabs(event: KeyboardEvent, index: number): void {
    let next: number;

    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % this.tabs.length;
        break;
      case 'ArrowLeft':
        next = (index - 1 + this.tabs.length) % this.tabs.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = this.tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    this.selectedTab.set(this.tabs[next].id);
    (event.currentTarget as HTMLElement).parentElement
      ?.querySelector<HTMLButtonElement>(`#player-tab-${this.tabs[next].id}`)
      ?.focus();
  }
}
