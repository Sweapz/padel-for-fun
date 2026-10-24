import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { SharedAuth } from '../auth/shared-auth';
import { SharedRepository } from './shared-repository';
import { APP_SETTINGS } from './runtime-settings';
import type { LocalLibrary } from '../../domain/local-session-format';
import type { TeamScores } from '../../domain/models';
import { validateScores } from '../../domain/scoring';
import { addPlayer } from '../../domain/players';
import { validatePlayers } from '../../domain/session-workflow';

@Injectable({ providedIn: 'root' })
export class SharedSessionStore {
  private readonly auth = inject(SharedAuth);
  private readonly repository = inject(SharedRepository);
  private readonly settings = inject(APP_SETTINGS);

  private readonly library = signal<LocalLibrary>({ players: [], sessions: [] });
  private groupId: string | null = null;
  private loadVersion = 0;
  private pendingLoad: { generation: number; promise: Promise<void> } | null = null;

  readonly sessions = computed(() => this.library().sessions);
  readonly players = computed(() => this.library().players);

  readonly loading = signal(true);
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly initialized: Promise<void>;

  constructor() {
    this.initialized = this.auth.initialized.then(() => this.load());
    const unsubscribe = this.auth.onIdentityChange(() => {
      this.library.set({ players: [], sessions: [] });
      this.groupId = null;
      this.loadVersion++;
      this.ready.set(false);
      this.busy.set(false);
      this.error.set('');
      this.notice.set('');

      if (this.auth.ready()) void this.load();
    });

    inject(DestroyRef).onDestroy(unsubscribe);
  }

  load(): Promise<void> {
    const generation = this.auth.generation();
    if (this.pendingLoad?.generation === generation) return this.pendingLoad.promise;

    const promise = this.fetch(generation, ++this.loadVersion).finally(() => {
      if (this.pendingLoad?.promise === promise) this.pendingLoad = null;
    });
    this.pendingLoad = { generation, promise };

    return promise;
  }

  private prefix(): string {
    return `padel-americano.pending.v1:${this.settings.mode === 'supabase' ? this.settings.url : ''}:${this.auth.userId()}:`;
  }

  private async fetch(generation: number, version: number): Promise<void> {
    if (!this.auth.signedIn()) {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    const prefix = this.prefix();

    try {
      const result = await this.repository.load();
      if (
        this.auth.generation() !== generation ||
        version !== this.loadVersion ||
        !this.auth.signedIn()
      )
        return;

      this.groupId = result.groupId;
      this.library.set(result.library);
      this.ready.set(true);
      this.error.set('');

      // Resolve a lost creation response once its saved session is visible in the library.
      try {
        const pending: { key: string; id: string }[] = [];
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const key = window.sessionStorage.key(i);
          if (key?.startsWith(`${prefix}["create",`))
            pending.push({ key, id: window.sessionStorage.getItem(key)! });
        }

        const receipts = await this.repository.knownCreations(pending.map((p) => p.id));
        for (const p of pending) {
          if (
            receipts.some(
              (r) =>
                r.requestId === p.id &&
                result.library.sessions.some((d) => d.session.id === r.sessionId),
            )
          )
            window.sessionStorage.removeItem(p.key);
        }
      } catch {
        /* Retry identifiers remain intact until they can be reconciled. */
      }
    } catch (error) {
      if (this.auth.generation() !== generation || version !== this.loadVersion) return;

      this.library.set({ players: [], sessions: [] });
      this.groupId = null;
      this.ready.set(false);
      this.error.set(error instanceof Error ? error.message : 'Could not load shared data.');
    } finally {
      if (this.auth.generation() === generation && version === this.loadVersion)
        this.loading.set(false);
    }
  }

  private requestId(fingerprint: string): { id: string; key: string; existed: boolean } {
    const key = this.prefix() + fingerprint;
    const existing = window.sessionStorage.getItem(key);
    if (existing && !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(existing))
      throw new Error('The saved retry identifier is invalid.');

    const id = existing ?? crypto.randomUUID();
    window.sessionStorage.setItem(key, id);

    return { id, key, existed: existing !== null };
  }

  private async write(action: () => Promise<void>, fingerprint?: string): Promise<boolean> {
    if (this.busy()) return false;

    const generation = this.auth.generation();
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');

    try {
      await this.initialized;
      if (!this.ready() || !this.auth.signedIn() || generation !== this.auth.generation())
        throw new Error('Sign in and load the shared group before saving.');

      await action();
      if (generation !== this.auth.generation()) return false;

      this.pendingLoad = null;
      await this.load();
      if (generation !== this.auth.generation()) return false;
      if (!this.ready())
        throw new Error(
          'The save may have succeeded. Reload the group or retry the same action safely.',
        );

      if (fingerprint) window.sessionStorage.removeItem(this.prefix() + fingerprint);
      return true;
    } catch (error) {
      if (generation === this.auth.generation())
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Could not confirm the save. Retry the same action safely.',
        );

      return false;
    } finally {
      if (generation === this.auth.generation()) this.busy.set(false);
    }
  }

  addPlayer(name: string): Promise<boolean> {
    return this.write(async () => {
      const player = addPlayer(this.players(), 'validation-only', name).at(-1)!;
      await this.repository.addPlayer(this.groupId!, player.name);
    });
  }

  async create(playerIds: readonly string[]): Promise<string | null> {
    let id: string | null = null;
    const fingerprint = JSON.stringify(['create', playerIds]);
    const ok = await this.write(async () => {
      const players = playerIds.map((id) => this.players().find((p) => p.id === id));

      if (players.some((p) => !p)) throw new Error('Choose players from your group.');

      validatePlayers(players as NonNullable<(typeof players)[number]>[]);

      if (
        !window.sessionStorage.getItem(this.prefix() + fingerprint) &&
        this.sessions().some((d) => d.session.status === 'active')
      )
        throw new Error('End the active session before creating another.');

      const retry = this.requestId(fingerprint);

      const result = await this.repository.schedule({
        action: 'create',
        groupId: this.groupId,
        playerIds,
        requestId: retry.id,
      });
      if (typeof result['sessionId'] !== 'string') throw new Error('Invalid creation receipt.');

      id = result['sessionId'];
    }, fingerprint);

    return ok ? id : null;
  }

  confirm(sessionId: string, matchId: string, scores: TeamScores): Promise<boolean> {
    const fingerprint = JSON.stringify(['confirm', sessionId, matchId, scores.teamA, scores.teamB]);

    return this.write(async () => {
      if (!validateScores(scores.teamA, scores.teamB).valid)
        throw new Error('Enter a valid match score.');

      await this.repository.confirm(sessionId, matchId, scores, this.requestId(fingerprint).id);
    }, fingerprint);
  }

  remove(sessionId: string): Promise<boolean> {
    return this.write(() => this.repository.remove(sessionId));
  }

  end(sessionId: string): Promise<boolean> {
    const fingerprint = JSON.stringify(['end', sessionId]);

    return this.write(
      () => this.repository.end(sessionId, this.requestId(fingerprint).id),
      fingerprint,
    );
  }
}
