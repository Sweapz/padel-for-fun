import type { SessionDocument } from './session-workflow';
import { validatePlayers } from './session-workflow';
import { validateScores } from './scoring';
import { COURT_COUNT, PLAYERS_PER_MATCH, PLAYERS_PER_TEAM } from './rules';
import type { Player } from './models';

export interface LocalLibrary {
  readonly players: readonly Player[];
  readonly sessions: readonly SessionDocument[];
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid saved object.');

  return value as Record<string, unknown>;
}

function string(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid saved text.');
}

function timestamp(value: unknown): void {
  string(value);

  if (!Number.isFinite(Date.parse(value))) throw new Error('Invalid saved timestamp.');
}

/** Validates the v1 fixed-roster prototype format. Never regenerates a published match. */
export function parseSessionLibrary(raw: string | null): readonly SessionDocument[] {
  if (raw === null) return [];

  const root = object(JSON.parse(raw));

  if (root['version'] === 2) return parseLocalLibrary(raw).sessions;

  if (root['version'] !== 1 || !Array.isArray(root['sessions']))
    throw new Error('Unsupported saved-session format.');

  const sessionIds = new Set<string>();
  let activeCount = 0;

  for (const entry of root['sessions']) {
    const doc = object(entry),
      session = object(doc['session']);

    if (!Array.isArray(doc['players'])) throw new Error('Missing saved players.');

    const players = doc['players'].map((value: unknown) => {
      const p = object(value);

      string(p['id']);
      string(p['name']);

      return { id: p['id'], name: p['name'] };
    });

    validatePlayers(players);
    string(session['id']);

    if (sessionIds.has(session['id'])) throw new Error('Duplicate saved session.');

    sessionIds.add(session['id']);
    timestamp(session['createdAt']);

    const roster = session['activePlayerIds'];

    if (
      !Array.isArray(roster) ||
      JSON.stringify([...roster].sort()) !== JSON.stringify(players.map((p) => p.id).sort()) ||
      session['courtCount'] !== COURT_COUNT ||
      !Array.isArray(session['history'])
    )
      throw new Error('Invalid saved roster.');

    const matchIds = new Set<string>();
    const assignment = (value: unknown, sequence: number, completed: boolean) => {
      const match = object(value);

      string(match['id']);

      if (
        matchIds.has(match['id']) ||
        match['sessionId'] !== session['id'] ||
        match['sequence'] !== sequence ||
        match['status'] !== (completed ? 'completed' : 'published')
      )
        throw new Error('Invalid saved match.');

      matchIds.add(match['id']);
      timestamp(match['publishedAt']);

      const a = match['teamA'],
        b = match['teamB'],
        rest = match['restingPlayerIds'];

      if (
        !Array.isArray(a) ||
        a.length !== PLAYERS_PER_TEAM ||
        !Array.isArray(b) ||
        b.length !== PLAYERS_PER_TEAM ||
        !Array.isArray(rest) ||
        rest.length !== roster.length - PLAYERS_PER_MATCH ||
        JSON.stringify([...a, ...b, ...rest].sort()) !== JSON.stringify([...roster].sort())
      )
        throw new Error('Invalid saved teams.');

      if (completed) {
        const result = object(match['result']),
          scores = object(result['scores']);

        if (!validateScores(scores['teamA'], scores['teamB']).valid)
          throw new Error('Invalid saved scores.');

        timestamp(result['confirmedAt']);
      } else if (match['result'] !== undefined) throw new Error('Published match has a result.');
    };

    session['history'].forEach((m: unknown, i: number) => assignment(m, i + 1, true));

    if (session['status'] === 'active') {
      if (++activeCount > 1) throw new Error('Only one local session may be active.');

      assignment(session['activeMatch'], session['history'].length + 1, false);

      if (session['endedAt'] !== undefined) throw new Error('Active session has an end time.');
    } else if (session['status'] === 'ended' && session['activeMatch'] === null) {
      timestamp(session['endedAt']);
    } else throw new Error('Invalid saved session status.');
  }

  // Every field consumed by this prototype has now been checked above.
  return root['sessions'] as readonly SessionDocument[];
}

export function serializeSessionLibrary(sessions: readonly SessionDocument[]): string {
  const raw = JSON.stringify({ version: 1, sessions });

  parseSessionLibrary(raw);

  return raw;
}

/** Upgrade legacy sessions by ID, never by name; historical snapshots remain unchanged. */
export function parseLocalLibrary(raw: string | null): LocalLibrary {
  if (raw === null) return { players: [], sessions: [] };

  const root = object(JSON.parse(raw));

  if (root['version'] === 1) {
    const sessions = parseSessionLibrary(raw);
    const profiles = new Map<string, Player>();

    for (const doc of sessions) {
      for (const player of doc.players) {
        const existing = profiles.get(player.id);

        if (existing && existing.name !== player.name)
          throw new Error('Conflicting legacy player IDs.');

        profiles.set(player.id, { ...player });
      }
    }

    return { players: [...profiles.values()], sessions };
  }

  if (
    root['version'] !== 2 ||
    !Array.isArray(root['players']) ||
    !Array.isArray(root['sessions'])
  ) {
    throw new Error('Unsupported player/session library.');
  }

  const players = root['players'].map((value: unknown) => {
    const player = object(value);
    string(player['id']);
    string(player['name']);

    return { id: player['id'], name: player['name'] };
  });
  const ids = new Set(players.map((player) => player.id));

  if (ids.size !== players.length) throw new Error('Duplicate player IDs.');

  const sessions = parseSessionLibrary(JSON.stringify({ version: 1, sessions: root['sessions'] }));

  if (sessions.some((doc) => doc.players.some((player) => !ids.has(player.id)))) {
    throw new Error('Saved session references an unknown player.');
  }

  return { players, sessions };
}

export function serializeLocalLibrary(library: LocalLibrary): string {
  const raw = JSON.stringify({ version: 2, ...library });
  parseLocalLibrary(raw);

  return raw;
}
