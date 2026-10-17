import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SessionStore } from '../../data/session-store';
import { SessionFeedback } from '../../components/session-feedback/session-feedback';
import {
  COURT_COUNT,
  isSupportedPlayerCount,
  PLAYERS_PER_MATCH,
  SUPPORTED_PLAYER_COUNTS,
} from '../../../domain/rules';

@Component({
  selector: 'app-session-setup',
  imports: [RouterLink, SessionFeedback],
  templateUrl: './session-setup.html',
  styleUrl: './session-setup.css',
})
export class SessionSetup {
  readonly store = inject(SessionStore);
  private readonly router = inject(Router);

  readonly playerCounts = SUPPORTED_PLAYER_COUNTS;
  readonly playersPerMatch = PLAYERS_PER_MATCH;
  readonly courtCount = COURT_COUNT;

  readonly count = signal<number>(SUPPORTED_PLAYER_COUNTS[0]);
  readonly selectedIds = signal<readonly string[]>([]);

  readonly availablePlayers = computed(() =>
    [...this.store.players()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((player) => ({
        ...player,
        duplicatedName:
          this.store
            .players()
            .filter((other) => other.name.trim().toLowerCase() === player.name.trim().toLowerCase())
            .length > 1,
      })),
  );
  readonly active = computed(() =>
    this.store.sessions().find((d) => d.session.status === 'active'),
  );
  readonly valid = computed(() => {
    const selected = this.selectedIds().map((id) =>
      this.store.players().find((player) => player.id === id),
    );
    const names = selected.map((player) => player?.name.trim().toLowerCase());

    return (
      selected.length === this.count() &&
      selected.every(Boolean) &&
      new Set(names).size === selected.length
    );
  });

  setCount(event: Event): void {
    const count = Number((event.target as HTMLSelectElement).value);

    if (!isSupportedPlayerCount(count)) return;

    this.count.set(count);
    this.selectedIds.update((ids) => ids.slice(0, count));
  }

  selectPlayer(id: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;

    this.selectedIds.update((ids) =>
      checked
        ? ids.length < this.count() && !ids.includes(id)
          ? [...ids, id]
          : ids
        : ids.filter((selected) => selected !== id),
    );
  }

  async start(event: Event): Promise<void> {
    event.preventDefault();

    if (!this.valid() || this.store.busy()) return;

    const id = await this.store.create(this.selectedIds());

    if (id) await this.router.navigate(['/session', id]);
  }
}
