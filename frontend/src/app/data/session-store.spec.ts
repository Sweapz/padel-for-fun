import { TestBed } from '@angular/core/testing';
import { BROWSER_STORAGE, SESSION_KEY, SESSION_LOCK, SessionStore } from './session-store';
import {
  parseSessionLibrary,
  serializeSessionLibrary,
  serializeLocalLibrary,
} from '../../domain/local-session-format';
import { createSession } from '../../domain/session-workflow';

describe('local session persistence', () => {
  let raw: string | null;
  let fail: boolean;
  let writes: number;
  const names = ['Anna', 'Bo', 'Cleo', 'Dan', 'Eva'];
  const initialRaw = serializeLocalLibrary({
    players: names.map((name) => ({ id: name, name })),
    sessions: [],
  });

  beforeEach(() => {
    raw = initialRaw;
    fail = false;
    writes = 0;

    TestBed.configureTestingModule({
      providers: [
        {
          provide: BROWSER_STORAGE,
          useValue: () => ({
            getItem: () => raw,
            setItem: (_key: string, value: string) => {
              if (fail) throw new Error('Storage quota exceeded.');

              raw = value;
              writes++;
            },
          }),
        },
        { provide: SESSION_LOCK, useValue: async (task: () => Promise<unknown>) => task() },
      ],
    });
  });

  it('commits result and exactly one next match in one write and blocks rapid duplicate submissions', async () => {
    const store = TestBed.inject(SessionStore);

    await store.initialized;

    const id = (await store.create(names))!;
    const match = store.sessions()[0].session.activeMatch!;
    const first = store.confirm(id, match.id, { teamA: 11, teamB: 5 });

    expect(store.busy()).toBe(true);

    const duplicate = store.confirm(id, match.id, { teamA: 11, teamB: 5 });

    expect(await first).toBe(true);
    expect(await duplicate).toBe(false);
    expect(writes).toBe(2);

    const saved = parseSessionLibrary(raw)[0].session;

    expect(saved.history).toHaveLength(1);
    expect(saved.activeMatch?.sequence).toBe(2);

    await store.confirm(id, match.id, { teamA: 11, teamB: 5 });

    expect(store.sessions()[0].session.history).toHaveLength(1);
  });

  it('keeps the published match and entered result retryable on save failure', async () => {
    const store = TestBed.inject(SessionStore);

    await store.initialized;

    const id = (await store.create(names))!;
    const before = raw;
    const match = store.sessions()[0].session.activeMatch!;

    fail = true;

    expect(await store.confirm(id, match.id, { teamA: 8, teamB: 8 })).toBe(false);
    expect(raw).toBe(before);
    expect(store.sessions()[0].session.activeMatch).toEqual(match);
    expect(store.sessions()[0].session.history).toHaveLength(0);
    expect(store.error()).toContain('quota');
    expect(store.busy()).toBe(false);

    fail = false;

    expect(await store.confirm(id, match.id, { teamA: 8, teamB: 8 })).toBe(true);
  });

  it('preserves corrupt saved data and prevents overwriting it', async () => {
    raw = '{broken';

    const store = TestBed.inject(SessionStore);

    await store.initialized;

    expect(store.ready()).toBe(false);
    expect(await store.create(names)).toBeNull();
    expect(raw).toBe('{broken');
    expect(writes).toBe(0);

    raw = null;
    store.load();

    expect(store.ready()).toBe(true);
  });

  it('detects another tab before writing and reloads external storage events', async () => {
    const store = TestBed.inject(SessionStore);

    await store.initialized;

    const external = createSession(
      names.map((name, i) => ({ id: String(i), name })),
      'external',
      'm1',
      '2026-10-17T10:00:00.000Z',
    );

    raw = serializeSessionLibrary([external]);

    expect(await store.create(names)).toBeNull();
    expect(writes).toBe(0);
    expect(store.error()).toContain('another tab');
    expect(store.sessions()[0].session.id).toBe('external');

    raw = null;
    window.dispatchEvent(new StorageEvent('storage', { key: SESSION_KEY }));

    expect(store.sessions()).toEqual([]);
    expect(store.notice()).toContain('another tab');
  });

  it('restores a stable match on load and retains ended sessions when starting another', async () => {
    const store = TestBed.inject(SessionStore);

    await store.initialized;

    const id = (await store.create(names))!;
    const match = store.sessions()[0].session.activeMatch;

    store.load();

    expect(store.sessions()[0].session.activeMatch).toEqual(match);
    expect(await store.create(names)).toBeNull();
    expect(await store.end(id)).toBe(true);

    await store.create(names);

    expect(parseSessionLibrary(raw)).toHaveLength(2);
    expect(store.sessions()[0].session.status).toBe('ended');
    expect(store.sessions()[1].session.status).toBe('active');
  });

  it('shows blocked-storage errors without starting an unsaved session', async () => {
    TestBed.overrideProvider(BROWSER_STORAGE, {
      useValue: () => {
        throw new Error('Access denied');
      },
    });

    const store = TestBed.inject(SessionStore);

    await store.initialized;

    expect(store.loading()).toBe(false);
    expect(store.ready()).toBe(false);
    expect(store.error()).toContain('could not be read');
    expect(await store.create(names)).toBeNull();
    expect(store.sessions()).toEqual([]);
  });

  it('keeps changes unpublished while waiting for the browser lock', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });

    TestBed.overrideProvider(SESSION_LOCK, {
      useValue: async (task: () => Promise<unknown>) => {
        await pending;

        return task();
      },
    });

    const store = TestBed.inject(SessionStore);

    await store.initialized;

    const saving = store.create(names);

    expect(store.busy()).toBe(true);
    expect(store.sessions()).toEqual([]);
    expect(raw).toBe(initialRaw);

    release();

    expect(await saving).not.toBeNull();
    expect(store.busy()).toBe(false);
  });

  it('reports an unavailable write lock without saving or publishing a session', async () => {
    TestBed.overrideProvider(SESSION_LOCK, {
      useValue: async () => {
        throw new Error('Web Locks unavailable');
      },
    });

    const store = TestBed.inject(SessionStore);

    await store.initialized;

    expect(await store.create(names)).toBeNull();
    expect(store.error()).toContain('Web Locks');
    expect(store.sessions()).toEqual([]);
    expect(raw).toBe(initialRaw);
    expect(store.busy()).toBe(false);
  });

  it('saves reusable profiles, rejects invalid selections, and preserves profiles on failure', async () => {
    const store = TestBed.inject(SessionStore);
    await store.initialized;

    expect(await store.addPlayer(' anna ')).toBe(false);
    expect(await store.addPlayer(' ')).toBe(false);
    expect(writes).toBe(0);
    expect(await store.create(['unknown', ...names.slice(1)])).toBeNull();
    expect(await store.create([names[0], names[0], ...names.slice(2)])).toBeNull();

    expect(await store.addPlayer(' Finn ')).toBe(true);
    const added = store.players().find((p) => p.name === 'Finn')!;

    store.load();
    expect(store.players().find((p) => p.id === added.id)).toEqual(added);

    const saved = raw;
    fail = true;
    expect(await store.addPlayer('Grace')).toBe(false);
    expect(store.players()).toHaveLength(6);
    expect(raw).toBe(saved);
  });
});
