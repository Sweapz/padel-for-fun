import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionStore } from '../../data/session-store';
import { SessionFeedback } from '../../components/session-feedback/session-feedback';
import { PLAYER_NAME_MAX_LENGTH, sessionsPlayed } from '../../../domain/players';

@Component({
  selector: 'app-players',
  imports: [RouterLink, SessionFeedback],
  templateUrl: './players.html',
  styleUrl: './players.css',
})
export class Players {
  readonly store = inject(SessionStore);

  readonly name = signal('');
  readonly message = signal('');
  readonly maxNameLength = PLAYER_NAME_MAX_LENGTH;

  readonly valid = computed(() => {
    const name = this.name().trim();

    return (
      !!name &&
      name.length <= this.maxNameLength &&
      !this.store.players().some((p) => p.name.trim().toLowerCase() === name.toLowerCase())
    );
  });
  readonly profiles = computed(() =>
    [...this.store.players()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((player) => ({
        ...player,
        sessionsPlayed: sessionsPlayed(player.id, this.store.sessions()),
        duplicatedName:
          this.store
            .players()
            .filter((other) => other.name.trim().toLowerCase() === player.name.trim().toLowerCase())
            .length > 1,
      })),
  );

  setName(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
    this.message.set('');
  }

  async add(event: Event): Promise<void> {
    event.preventDefault();

    if (!this.valid() || this.store.busy()) return;

    if (await this.store.addPlayer(this.name())) {
      this.message.set(`${this.name().trim()} added.`);
      this.name.set('');
    }
  }
}
