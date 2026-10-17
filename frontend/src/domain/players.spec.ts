import { describe, expect, it } from 'vitest';
import { addPlayer, PLAYER_NAME_MAX_LENGTH, sessionsPlayed } from './players';
import { confirmResult, createSession, endSession } from './session-workflow';
import {
  parseLocalLibrary,
  serializeLocalLibrary,
  serializeSessionLibrary,
} from './local-session-format';

const now = '2026-10-17T10:00:00.000Z';
const players = ['Anna', 'Bo', 'Cleo', 'Dan', 'Eva'].map((name, i) => ({ id: `p${i}`, name }));

describe('reusable player profiles', () => {
  it('trims names, preserves stable IDs, and rejects blank/duplicate/oversized names', () => {
    expect(addPlayer([], 'a', ' Anna ')).toEqual([{ id: 'a', name: 'Anna' }]);
    expect(() => addPlayer(players, 'new', ' ANNA ')).toThrow('already exists');
    expect(() => addPlayer(players, 'p0', 'Other')).toThrow('ID');
    expect(() => addPlayer(players, 'new', ' ')).toThrow();
    expect(() => addPlayer(players, 'new', 'a'.repeat(PLAYER_NAME_MAX_LENGTH + 1))).toThrow();
    expect(players).toHaveLength(5);
  });

  it('counts participation once per session, excludes unplayed/rest-only sessions, and links by ID', () => {
    const first = createSession(players, 's1', 'm1', now);
    expect(sessionsPlayed('p0', [first])).toBe(0);

    const match = first.session.activeMatch!;
    const played = {
      ...first,
      session: confirmResult(first.session, 'm1', { teamA: 8, teamB: 8 }, 'm2', now),
    };
    expect(sessionsPlayed(match.teamA[0], [played])).toBe(1);
    expect(sessionsPlayed(match.restingPlayerIds[0], [played])).toBe(0);

    const twice = {
      ...played,
      session: confirmResult(played.session, 'm2', { teamA: 8, teamB: 8 }, 'm3', now),
    };
    expect(sessionsPlayed(match.teamA[0], [twice])).toBe(1);

    const second = createSession(players, 's2', 'm4', now);
    const again = {
      ...second,
      session: confirmResult(second.session, 'm4', { teamA: 8, teamB: 8 }, 'm5', now),
    };
    expect(sessionsPlayed(match.teamA[0], [twice, again])).toBe(2);
    expect(sessionsPlayed('unrelated-same-name', [twice, again])).toBe(0);
  });

  it('loads legacy players by ID without changing history, names, or published matches', () => {
    const legacy = createSession(players, 's1', 'm1', now);
    const original = structuredClone(legacy);
    const library = parseLocalLibrary(serializeSessionLibrary([legacy]));

    expect(library.players).toEqual(players);
    expect(library.sessions).toEqual([original]);
    expect(parseLocalLibrary(serializeLocalLibrary(library))).toEqual(library);
    expect(legacy).toEqual(original);
  });

  it('keeps same-name legacy identities separate and rejects malformed profile libraries', () => {
    const first = createSession(players, 's1', 'm1', now);
    const second = createSession(
      players.map((p) => ({ ...p, id: `different-${p.id}` })),
      's2',
      'm2',
      now,
    );
    const docs = [{ ...first, session: endSession(first.session, now) }, second];
    const imported = parseLocalLibrary(serializeSessionLibrary(docs));

    expect(imported.players).toHaveLength(10);
    expect(imported.players.filter((p) => p.name === 'Anna')).toHaveLength(2);
    expect(imported.sessions).toEqual(docs);

    expect(() =>
      parseLocalLibrary(
        JSON.stringify({ version: 2, players: [players[0], players[0]], sessions: [] }),
      ),
    ).toThrow('Duplicate');
    expect(() => serializeLocalLibrary({ players: [], sessions: [first] })).toThrow(
      'unknown player',
    );
    expect(() =>
      parseLocalLibrary(
        JSON.stringify({ version: 2, players: [{ id: 'id', name: '' }], sessions: [] }),
      ),
    ).toThrow();
  });
});
