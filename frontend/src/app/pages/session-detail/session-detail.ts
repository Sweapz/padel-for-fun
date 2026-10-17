import { DatePipe } from '@angular/common';
import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { TeamScores } from '../../../domain/models';
import { SessionStore } from '../../data/session-store';
import { SessionFeedback } from '../../components/session-feedback/session-feedback';
import { ScoreEntry } from '../../components/score-entry/score-entry';
import { Standings } from '../../components/standings/standings';

type SessionTab = 'current' | 'history' | 'scoreboard';

@Component({
  selector: 'app-session-detail',
  imports: [RouterLink, DatePipe, SessionFeedback, ScoreEntry, Standings],
  templateUrl: './session-detail.html',
  styleUrl: './session-detail.css',
})
export class SessionDetail {
  readonly store = inject(SessionStore);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);

  readonly document = computed(() =>
    this.store.sessions().find((d) => d.session.id === this.params()?.get('id')),
  );
  readonly currentMatch = computed(() => {
    const match = this.document()?.session.activeMatch;

    return match ? [match] : [];
  });
  readonly history = computed(() => [...(this.document()?.session.history ?? [])].reverse());

  readonly ending = signal(false);
  readonly message = signal('');

  readonly tabs = [
    { id: 'current', label: 'Current match' },
    { id: 'scoreboard', label: 'Scoreboard' },
    { id: 'history', label: 'History' },
  ] as const;
  readonly selectedTab = signal<SessionTab | null>(null);
  readonly activeTab = computed(
    () =>
      this.selectedTab() ??
      (this.document()?.session.status === 'ended' ? 'scoreboard' : 'current'),
  );

  readonly matchHeading = viewChild<ElementRef<HTMLElement>>('matchHeading');

  constructor() {
    effect(() => {
      const heading = this.matchHeading();

      if (heading && untracked(this.activeTab) === 'current') heading.nativeElement.focus();
    });
  }

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
    const button = event.currentTarget as HTMLElement;
    button.parentElement?.querySelector<HTMLButtonElement>(`#tab-${this.tabs[next].id}`)?.focus();
  }

  names(ids: readonly string[]): string {
    return ids
      .map((id) => this.document()?.players.find((p) => p.id === id)?.name ?? id)
      .join(' & ');
  }

  async confirm(matchId: string, scores: TeamScores): Promise<void> {
    const doc = this.document();

    if (!doc) return;

    this.message.set('');

    if (await this.store.confirm(doc.session.id, matchId, scores)) {
      this.selectedTab.set('current');
      this.message.set('Result saved. Your next match is ready.');
    }
  }

  async end(): Promise<void> {
    const doc = this.document();

    if (!doc) return;

    this.message.set('');

    if (await this.store.end(doc.session.id)) {
      this.ending.set(false);
      this.selectedTab.set('scoreboard');
      this.message.set('Session ended. All completed results are saved.');
    }
  }
}
