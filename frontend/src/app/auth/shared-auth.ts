import { computed, DestroyRef, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { APP_SETTINGS } from '../data/runtime-settings';
import type { Database } from '../data/database.types';

export const AUTH_STORAGE_KEY = 'padel-americano.auth.v1';
export const SUPABASE_CLIENT = new InjectionToken<SupabaseClient<Database> | null>(
  'Supabase browser client',
  {
    providedIn: 'root',
    factory: () => {
      const settings = inject(APP_SETTINGS);

      return settings.mode === 'supabase'
        ? createClient<Database>(settings.url, settings.publishableKey, {
            auth: {
              storageKey: AUTH_STORAGE_KEY,
              detectSessionInUrl: false,
              persistSession: true,
              autoRefreshToken: true,
            },
          })
        : null;
    },
  },
);

@Injectable({ providedIn: 'root' })
export class SharedAuth {
  private readonly settings = inject(APP_SETTINGS);
  private readonly client = inject(SUPABASE_CLIENT);

  private readonly listeners = new Set<() => void>();
  private locallySignedOut = false;

  readonly shared = this.settings.mode === 'supabase';
  readonly userId = signal<string | null>(null);
  readonly generation = signal(0);
  readonly signedIn = computed(() => this.userId() !== null);
  readonly ready = signal(!this.shared);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly initialized: Promise<void>;

  constructor() {
    if (this.client) {
      const { data } = this.client.auth.onAuthStateChange((_event, session) => {
        if (!this.locallySignedOut || !session) this.setUser(session?.user.id ?? null);
      });

      inject(DestroyRef).onDestroy(() => data.subscription.unsubscribe());
    }

    this.initialized = this.restore();
  }

  onIdentityChange(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  private setUser(id: string | null): void {
    if (id === this.userId()) return;

    this.userId.set(id);
    this.generation.update((n) => n + 1);
    for (const listener of this.listeners) listener();
  }

  async restore(): Promise<void> {
    if (!this.client) return;

    this.ready.set(false);
    this.error.set('');

    try {
      const { data, error } = await this.client.auth.getSession();

      if (error) throw error;

      if (data.session && !this.locallySignedOut) {
        const verified = await this.client.auth.getUser();

        if (verified.error || !verified.data.user || verified.data.user.is_anonymous)
          throw new Error('Sign-in could not be verified.');

        this.setUser(verified.data.user.id);
      } else this.setUser(null);
    } catch {
      this.setUser(null);
      this.error.set('Could not restore sign-in. Check your connection and try again.');
    } finally {
      this.ready.set(true);
    }
  }

  async signIn(password: string): Promise<boolean> {
    if (this.busy() || !this.client || this.settings.mode !== 'supabase') return false;

    this.busy.set(true);
    this.error.set('');
    this.locallySignedOut = false;

    try {
      const { data, error } = await this.client.auth.signInWithPassword({
        email: this.settings.loginEmail,
        password,
      });

      if (error || !data.user || data.user.is_anonymous) throw new Error('Sign-in failed.');

      this.setUser(data.user.id);
      await this.client.auth.startAutoRefresh();
      return true;
    } catch {
      this.setUser(null);
      this.error.set('Could not sign in. Check the password and your connection, then try again.');
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  async signOut(): Promise<void> {
    this.locallySignedOut = true;
    this.setUser(null);
    this.busy.set(true);
    this.error.set('');

    try {
      await this.client?.auth.signOut({ scope: 'local' });
    } catch {
      this.error.set('Signed out on this device. The server could not be reached.');
    } finally {
      await this.client?.auth.stopAutoRefresh();
      // Clear this app's token cache even if the server cannot be reached.
      try {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
      } catch {
        /* Storage may be blocked. */
      }
      this.busy.set(false);
    }
  }
}
