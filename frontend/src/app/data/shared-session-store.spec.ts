import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SharedSessionStore } from './shared-session-store';
import { SharedRepository } from './shared-repository';
import { SharedAuth } from '../auth/shared-auth';
import { APP_SETTINGS, parseSettings } from './runtime-settings';
import { createSession } from '../../domain/session-workflow';

describe('shared persistence and retry safety', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  let listener: () => void;
  let auth: {
    initialized: Promise<void>;
    generation: ReturnType<typeof signal<number>>;
    signedIn: ReturnType<typeof signal<boolean>>;
    ready: ReturnType<typeof signal<boolean>>;
    userId: ReturnType<typeof signal<string | null>>;
    onIdentityChange: (fn: () => void) => () => void;
  };
  let repository: {
    load: ReturnType<typeof vi.fn>;
    confirm: ReturnType<typeof vi.fn>;
    schedule: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    addPlayer: ReturnType<typeof vi.fn>;
    knownCreations: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    sessionStorage.clear();
    auth = {
      initialized: Promise.resolve(),
      generation: signal(1),
      signedIn: signal(true),
      ready: signal(true),
      userId: signal('user'),
      onIdentityChange: (fn) => {
        listener = fn;
        return () => undefined;
      },
    };
    repository = {
      load: vi.fn(async () => ({
        groupId: 'group',
        library: { players: ids.map((id) => ({ id, name: id })), sessions: [] },
      })),
      confirm: vi.fn(async () => undefined),
      schedule: vi.fn(async () => ({ sessionId: 'created' })),
      end: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
      addPlayer: vi.fn(async () => undefined),
      knownCreations: vi.fn(async () => []),
    };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: APP_SETTINGS,
          useValue: {
            mode: 'supabase',
            url: 'http://localhost:54321',
            publishableKey: 'sb_publishable_test',
            loginEmail: 'group@example.com',
          },
        },
        { provide: SharedAuth, useValue: auth },
        { provide: SharedRepository, useValue: repository },
      ],
    });
  });

  it('reloads after deletion and permits retry after an uncertain response', async () => {
    const store = TestBed.inject(SharedSessionStore);
    await store.initialized;
    repository.remove.mockRejectedValueOnce(new Error('Connection lost'));

    expect(await store.remove('session')).toBe(false);
    expect(store.error()).toBe('Connection lost');

    expect(await store.remove('session')).toBe(true);
    expect(repository.remove).toHaveBeenCalledTimes(2);
    expect(repository.remove).toHaveBeenLastCalledWith('session');
    expect(repository.load).toHaveBeenCalledTimes(2);
    expect(store.error()).toBe('');
  });

  it('loads initially without polling or reloading when the window gains focus', async () => {
    vi.useFakeTimers();

    try {
      const store = TestBed.inject(SharedSessionStore);
      await store.initialized;

      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(60000);

      expect(store.ready()).toBe(true);
      expect(repository.load).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retains the same request ID after an uncertain confirmation and refetches after success', async () => {
    const store = TestBed.inject(SharedSessionStore);
    await store.initialized;
    repository.confirm.mockRejectedValueOnce(new Error('Network response lost.'));

    expect(await store.confirm('session', 'match', { teamA: 8, teamB: 8 })).toBe(false);
    expect(await store.confirm('session', 'match', { teamA: 8, teamB: 8 })).toBe(true);
    expect(repository.confirm.mock.calls[0][3]).toBe(repository.confirm.mock.calls[1][3]);
    expect(repository.load).toHaveBeenCalledTimes(2);
    expect(sessionStorage.length).toBe(0);
  });

  it('restores pending request IDs after the store is recreated', async () => {
    const store = TestBed.inject(SharedSessionStore);
    await store.initialized;
    repository.confirm.mockRejectedValueOnce(new Error('Network response lost.'));
    await store.confirm('session', 'match', { teamA: 8, teamB: 8 });
    const id = repository.confirm.mock.calls[0][3];

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_SETTINGS, useValue: { mode: 'supabase', url: 'http://localhost:54321' } },
        { provide: SharedAuth, useValue: auth },
        { provide: SharedRepository, useValue: repository },
      ],
    });
    const restored = TestBed.inject(SharedSessionStore);
    await restored.initialized;
    expect(await restored.confirm('session', 'match', { teamA: 8, teamB: 8 })).toBe(true);
    expect(repository.confirm.mock.calls[1][3]).toBe(id);
  });

  it('clears loaded group data on sign-out and ignores an in-flight read', async () => {
    const store = TestBed.inject(SharedSessionStore);
    await store.initialized;
    let release!: (value: unknown) => void;
    repository.load.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const loading = store.load();

    auth.signedIn.set(false);
    auth.userId.set(null);
    auth.generation.update((n) => n + 1);
    listener();
    expect(store.players()).toEqual([]);
    expect(store.sessions()).toEqual([]);
    release({
      groupId: 'old',
      library: { players: [{ id: 'private', name: 'Old player' }], sessions: [] },
    });
    await loading;
    expect(store.players()).toEqual([]);
    expect(store.ready()).toBe(false);
  });

  it('never creates a local session or publishes an optimistic next match on failure', async () => {
    const store = TestBed.inject(SharedSessionStore);
    await store.initialized;
    const original = localStorage.getItem('padel-americano.sessions.v1');
    repository.schedule.mockRejectedValue(new Error('Server unavailable.'));

    expect(await store.create(ids)).toBeNull();
    expect(store.sessions()).toEqual([]);
    expect(localStorage.getItem('padel-americano.sessions.v1')).toBe(original);
    expect(store.error()).toContain('unavailable');
  });

  it('blocks a fresh creation while a session is active', async () => {
    const document = createSession(
      ids.map((id) => ({ id, name: id })),
      'existing',
      'match',
      '2026-10-18T12:00:00Z',
    );
    repository.load.mockResolvedValue({
      groupId: 'group',
      library: { players: document.players, sessions: [document] },
    });
    const store = TestBed.inject(SharedSessionStore);
    await store.initialized;

    expect(await store.create(ids)).toBeNull();
    expect(repository.schedule).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it('rejects unreadable shared data and does not allow writes before reload', async () => {
    repository.load.mockRejectedValue(new Error('Shared data unreadable.'));
    const store = TestBed.inject(SharedSessionStore);
    await store.initialized;

    expect(store.ready()).toBe(false);
    expect(await store.addPlayer('New player')).toBe(false);
    expect(repository.addPlayer).not.toHaveBeenCalled();
  });

  it('does not send a mutation when its retry identifier cannot be saved', async () => {
    const store = TestBed.inject(SharedSessionStore);
    await store.initialized;
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Retry storage unavailable.');
    });

    try {
      expect(await store.confirm('session', 'match', { teamA: 8, teamB: 8 })).toBe(false);
      expect(repository.confirm).not.toHaveBeenCalled();
      expect(store.error()).toContain('storage unavailable');
    } finally {
      blocked.mockRestore();
    }
  });
});

describe('public runtime configuration', () => {
  it('accepts explicit local and public shared settings', () => {
    expect(parseSettings({ mode: 'local' })).toEqual({ mode: 'local' });
    expect(
      parseSettings({
        mode: 'supabase',
        url: 'http://127.0.0.1:54321',
        publishableKey: 'sb_publishable_test',
        loginEmail: 'group@example.com',
      }).mode,
    ).toBe('supabase');
  });

  it('fails closed for privileged keys, missing shared settings and unexpected fields', () => {
    const settings = {
      mode: 'supabase',
      url: 'http://localhost:54321',
      loginEmail: 'group@example.com',
    };
    expect(() => parseSettings({ ...settings, publishableKey: 'sb_secret_forbidden' })).toThrow();
    expect(() => parseSettings(settings)).toThrow();
    expect(() => parseSettings({ mode: 'local', password: 'not-allowed' })).toThrow();
    expect(() =>
      parseSettings({
        ...settings,
        publishableKey: 'sb_publishable_test',
        password: 'not-allowed',
      }),
    ).toThrow();
  });
});
