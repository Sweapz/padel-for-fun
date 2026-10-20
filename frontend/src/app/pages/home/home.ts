import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionStore } from '../../data/session-store';
import { SessionFeedback } from '../../components/session-feedback/session-feedback';
import { COURT_COUNT, MATCH_POINTS, SUPPORTED_PLAYER_COUNTS } from '../../../domain/rules';
import { SessionList } from '../../components/session-list/session-list';
import { clubhouseStandings, previousSessions } from '../../../domain/clubhouse';
import { ClubhouseLeaderboard } from '../../components/clubhouse-leaderboard/clubhouse-leaderboard';

@Component({
  selector: 'app-home',
  imports: [RouterLink, SessionFeedback, SessionList, ClubhouseLeaderboard],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  readonly store = inject(SessionStore);

  readonly rulesOpen = signal(false);
  readonly activeTab = signal<'leaderboard' | 'previous'>('leaderboard');
  readonly tabs = [
    { id: 'leaderboard', label: 'Clubhouse leaderboard' },
    { id: 'previous', label: 'Previous sessions' },
  ] as const;

  readonly recentSessionLimit = 5;
  readonly recentSessions = computed(() =>
    previousSessions(this.store.sessions()).slice(0, this.recentSessionLimit),
  );
  readonly activeSessions = computed(() =>
    this.store.sessions().filter((doc) => doc.session.status === 'active'),
  );
  readonly leaderboard = computed(() =>
    clubhouseStandings(this.store.players(), this.store.sessions()),
  );

  readonly matchPoints = MATCH_POINTS;
  readonly courtCount = COURT_COUNT;
  readonly playerCountRange = SUPPORTED_PLAYER_COUNTS.join('–');
  readonly playerCountOptions = SUPPORTED_PLAYER_COUNTS.join(' or ');

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
    this.activeTab.set(this.tabs[next].id);
    const button = event.currentTarget as HTMLElement;
    button.parentElement
      ?.querySelector<HTMLButtonElement>(`#club-tab-${this.tabs[next].id}`)
      ?.focus();
  }
}
