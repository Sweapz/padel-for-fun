import { inject, InjectionToken, type Signal } from '@angular/core';
import { APP_SETTINGS } from './runtime-settings';
import { LocalSessionStore } from './local-session-store';
import { SharedSessionStore } from './shared-session-store';
import type { LocalLibrary } from '../../domain/local-session-format';
import type { TeamScores } from '../../domain/models';

export { BROWSER_STORAGE, SESSION_KEY, SESSION_LOCK } from './local-session-store';

export interface SessionStore {
  readonly players: Signal<LocalLibrary['players']>;
  readonly sessions: Signal<LocalLibrary['sessions']>;
  readonly loading: Signal<boolean>;
  readonly ready: Signal<boolean>;
  readonly busy: Signal<boolean>;
  readonly error: Signal<string>;
  readonly notice: Signal<string>;
  readonly initialized: Promise<void>;
  load(): void | Promise<void>;
  addPlayer(name: string): Promise<boolean>;
  create(ids: readonly string[]): Promise<string | null>;
  confirm(sessionId: string, matchId: string, scores: TeamScores): Promise<boolean>;
  end(sessionId: string): Promise<boolean>;
}

export const SessionStore = new InjectionToken<SessionStore>('Session persistence', {
  providedIn: 'root',
  factory: () =>
    inject(APP_SETTINGS).mode === 'supabase'
      ? inject(SharedSessionStore)
      : inject(LocalSessionStore),
});
