import { computed, DestroyRef, Injectable, InjectionToken, inject, signal } from '@angular/core';
import type { TeamScores } from '../../domain/models';
import type { SessionDocument } from '../../domain/session-workflow';
import { confirmResult, createSession, endSession } from '../../domain/session-workflow';
import { parseLocalLibrary, serializeLocalLibrary } from '../../domain/local-session-format';
import type { LocalLibrary } from '../../domain/local-session-format';
import { addPlayer } from '../../domain/players';

export const SESSION_KEY = 'padel-americano.sessions.v1';

export const BROWSER_STORAGE = new InjectionToken<() => Pick<Storage, 'getItem' | 'setItem'>>(
  'Browser storage',
  {
    providedIn: 'root',
    factory: () => () => window.localStorage,
  },
);

type Lock = <T>(task: () => Promise<T>) => Promise<T>;

export const SESSION_LOCK = new InjectionToken<Lock>('Local session write lock', {
  providedIn: 'root',
  factory: () => (task) => {
    if (!navigator.locks)
      return Promise.reject(
        new Error('Saving needs a browser with Web Locks on localhost or HTTPS.'),
      );

    return navigator.locks.request(SESSION_KEY, task);
  },
});

@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly storage = inject(BROWSER_STORAGE);
  private readonly lock = inject(SESSION_LOCK);

  private raw: string | null = null;
  private readonly library = signal<LocalLibrary>({ players: [], sessions: [] });
  readonly sessions = computed(() => this.library().sessions);
  readonly players = computed(() => this.library().players);

  readonly loading = signal(true);
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');

  readonly initialized: Promise<void>;

  constructor() {
    this.initialized = Promise.resolve().then(() => this.load());

    const onStorage = (event: StorageEvent) => {
      if ((event.key === SESSION_KEY || event.key === null) && !this.busy()) {
        this.load();
        this.notice.set('Players or sessions updated in another tab. Review before saving.');
      }
    };

    window.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', onStorage));
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    try {
      const raw = this.storage().getItem(SESSION_KEY);

      this.library.set(parseLocalLibrary(raw));
      this.raw = raw;
      this.ready.set(true);
    } catch {
      this.ready.set(false);
      this.error.set(
        'Saved players and sessions could not be read. Browser storage may be blocked or the saved data is invalid. Existing data has not been overwritten.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  addPlayer(name: string): Promise<boolean> {
    return this.write((library) => ({
      ...library,
      players: addPlayer(library.players, crypto.randomUUID(), name),
    }));
  }

  async create(playerIds: readonly string[]): Promise<string | null> {
    let id: string | null = null;

    const ok = await this.write((library) => {
      if (library.sessions.some((d) => d.session.status === 'active'))
        throw new Error('End your active session before creating another.');

      const players = playerIds.map((id) => {
        const player = library.players.find((player) => player.id === id);

        if (!player) throw new Error('Choose players from the saved player list.');

        return player;
      });

      id = crypto.randomUUID();

      return {
        ...library,
        sessions: [
          ...library.sessions,
          createSession(players, id, crypto.randomUUID(), new Date().toISOString()),
        ],
      };
    });

    return ok ? id : null;
  }

  confirm(sessionId: string, matchId: string, scores: TeamScores): Promise<boolean> {
    return this.update(sessionId, (doc) => ({
      ...doc,
      session: confirmResult(
        doc.session,
        matchId,
        scores,
        crypto.randomUUID(),
        new Date().toISOString(),
      ),
    }));
  }

  end(sessionId: string): Promise<boolean> {
    return this.update(sessionId, (doc) => ({
      ...doc,
      session: endSession(doc.session, new Date().toISOString()),
    }));
  }

  private update(
    id: string,
    change: (document: SessionDocument) => SessionDocument,
  ): Promise<boolean> {
    return this.write((library) => {
      const documents = library.sessions;
      if (!documents.some((d) => d.session.id === id))
        throw new Error('Session not found. Return to your court.');

      return {
        ...library,
        sessions: documents.map((doc) => (doc.session.id === id ? change(doc) : doc)),
      };
    });
  }

  private async write(change: (library: LocalLibrary) => LocalLibrary): Promise<boolean> {
    if (this.busy()) return false;

    this.busy.set(true);
    this.error.set('');
    this.notice.set('');

    try {
      await this.initialized;

      if (!this.ready())
        throw new Error('Saved sessions must be readable before you can save changes.');

      await this.lock(async () => {
        const storage = this.storage();
        const current = storage.getItem(SESSION_KEY);

        if (current !== this.raw) {
          this.library.set(parseLocalLibrary(current));
          this.raw = current;

          throw new Error(
            'This session changed in another tab. Review the current match and try again.',
          );
        }

        const next = change(this.library());
        const raw = serializeLocalLibrary(next);

        // Completion and its single next match are saved as one value, before publishing in memory.
        storage.setItem(SESSION_KEY, raw);
        this.raw = raw;
        this.library.set(next);
      });

      return true;
    } catch (error) {
      this.error.set(
        `Changes were not saved. ${error instanceof Error ? error.message : 'Browser storage is unavailable.'}`,
      );

      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
