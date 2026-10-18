import { inject, Injectable } from '@angular/core';
import { SUPABASE_CLIENT } from '../auth/shared-auth';
import type { LocalLibrary } from '../../domain/local-session-format';
import { parseSessionLibrary } from '../../domain/local-session-format';
import { COURT_COUNT, MATCH_POINTS } from '../../domain/rules';
import type { TeamScores } from '../../domain/models';

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid shared data.');

  return value as Record<string, unknown>;
}

export function decodeSnapshot(value: unknown): LocalLibrary['sessions'][number] {
  const source = record(value);
  const session = record(source['session']);
  const rows = source['players'];
  const matches = source['matches'];

  if (
    !Array.isArray(rows) ||
    !Array.isArray(matches) ||
    session['match_points'] !== MATCH_POINTS ||
    session['court_count'] !== COURT_COUNT ||
    session['rules_version'] !== 'americano-16-v1' ||
    session['scheduler_version'] !== 'lexicographic-v1'
  )
    throw new Error('Unsupported shared session.');

  const players = rows.map((row: unknown) => {
    const p = record(row);
    if (p['is_active'] !== true) throw new Error('Unsupported changing roster.');

    return { id: p['player_id'], name: p['display_name_snapshot'] };
  });
  const decodeMatch = (value: unknown) => {
    const match = record(value);
    if (!Array.isArray(match['participants'])) throw new Error('Missing shared teams.');

    const participants = match['participants'].map(record);
    const side = (slots: string[]) =>
      slots.map((slot) => {
        const entries = participants.filter((p) => p['slot'] === slot);
        if (entries.length !== 1) throw new Error('Invalid shared teams.');

        return entries[0]['player_id'];
      });
    const result =
      match['status'] === 'completed'
        ? {
            scores: { teamA: match['score_a'], teamB: match['score_b'] },
            confirmedAt: match['confirmed_at'],
          }
        : undefined;

    if (
      participants.some(
        (p) => !['a1', 'a2', 'b1', 'b2', 'rest1', 'rest2'].includes(String(p['slot'])),
      ) ||
      participants.length !== players.length
    )
      throw new Error('Invalid shared assignment.');

    return {
      id: match['id'],
      sessionId: match['session_id'],
      sequence: match['sequence'],
      status: match['status'],
      teamA: side(['a1', 'a2']),
      teamB: side(['b1', 'b2']),
      restingPlayerIds: participants
        .filter((p) => String(p['slot']).startsWith('rest'))
        .map((p) => p['player_id']),
      publishedAt: match['published_at'],
      ...(result ? { result } : {}),
    };
  };
  const entries = matches.map(record);
  if (entries.some((m) => !['published', 'completed', 'cancelled'].includes(String(m['status']))))
    throw new Error('Invalid match state.');

  const published = entries.filter((m) => m['status'] === 'published');
  if (published.length !== (session['status'] === 'active' ? 1 : 0))
    throw new Error('Invalid current match.');

  const document = {
    players,
    session: {
      id: session['id'],
      status: session['status'],
      courtCount: session['court_count'],
      createdAt: session['created_at'],
      activePlayerIds: players.map((p) => p.id),
      history: entries.filter((m) => m['status'] === 'completed').map(decodeMatch),
      activeMatch: published.length ? decodeMatch(published[0]) : null,
      ...(session['status'] === 'ended' ? { endedAt: session['ended_at'] } : {}),
    },
  };

  return parseSessionLibrary(JSON.stringify({ version: 1, sessions: [document] }))[0];
}

@Injectable({ providedIn: 'root' })
export class SharedRepository {
  private readonly client = inject(SUPABASE_CLIENT);

  private api() {
    if (!this.client) throw new Error('Shared storage is not configured.');

    return this.client;
  }

  async load(): Promise<{ groupId: string; library: LocalLibrary }> {
    const client = this.api();
    const memberships = await client.from('memberships').select('group_id');
    if (memberships.error || memberships.data.length !== 1)
      throw new Error('This account needs access to exactly one padel group.');

    const groupId = String(memberships.data[0].group_id);
    const players: LocalLibrary['players'][number][] = [];
    const sessions: LocalLibrary['sessions'][number][] = [];
    const sessionIds: string[] = [];

    for (let offset = 0; ; offset += 500) {
      const page = await client
        .from('players')
        .select('id,name')
        .eq('group_id', groupId)
        .is('archived_at', null)
        .order('id')
        .range(offset, offset + 499);
      if (page.error) throw new Error('Could not load shared players.');

      for (const p of page.data) {
        if (typeof p.id !== 'string' || typeof p.name !== 'string' || !p.name.trim())
          throw new Error('Invalid shared player.');
        players.push({ id: p.id, name: p.name });
      }

      if (page.data.length < 500) break;
    }

    for (let offset = 0; ; offset += 500) {
      const page = await client
        .from('sessions')
        .select('id')
        .eq('group_id', groupId)
        .order('created_at')
        .order('id')
        .range(offset, offset + 499);
      if (page.error) throw new Error('Could not load shared sessions.');
      sessionIds.push(...page.data.map((s) => String(s.id)));

      if (page.data.length < 500) break;
    }

    for (let offset = 0; offset < sessionIds.length; offset += 5) {
      sessions.push(
        ...(await Promise.all(
          sessionIds.slice(offset, offset + 5).map(async (id) => {
            const result = await client.rpc('get_session_snapshot', { p_session_id: id });
            if (result.error || !result.data)
              throw new Error('Could not load the current shared session.');

            return decodeSnapshot(result.data);
          }),
        )),
      );
    }

    return { groupId, library: { players, sessions } };
  }

  async knownCreations(requestIds: string[]): Promise<{ requestId: string; sessionId: string }[]> {
    if (!requestIds.length) return [];

    const result = await this.api()
      .from('operation_receipts')
      .select('request_id,response')
      .eq('kind', 'create')
      .in('request_id', requestIds);
    if (result.error) return [];

    return result.data.map((r) => ({
      requestId: String(r.request_id),
      sessionId: String(record(r.response)['sessionId']),
    }));
  }

  async addPlayer(groupId: string, name: string): Promise<void> {
    const result = await this.api().rpc('create_player', { p_group_id: groupId, p_name: name });
    if (result.error)
      throw new Error(
        'Could not confirm the player was saved. Reload before trying again; names must be unique.',
      );
  }

  async schedule(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await this.api().functions.invoke('schedule', { body });
    if (result.error) {
      const response: unknown = 'context' in result.error ? result.error.context : null;
      if (response instanceof Response && response.status === 409)
        throw new Error(
          'The session changed or already has a different result. Refresh to review it.',
        );

      throw new Error(
        'Could not confirm the save. Check your connection and retry the same action safely.',
      );
    }

    return record(result.data);
  }

  async confirm(
    sessionId: string,
    matchId: string,
    scores: TeamScores,
    requestId: string,
  ): Promise<void> {
    await this.schedule({
      action: 'confirm',
      sessionId,
      matchId,
      scoreA: scores.teamA,
      scoreB: scores.teamB,
      requestId,
    });
  }

  async end(sessionId: string, requestId: string): Promise<void> {
    const result = await this.api().rpc('end_session', {
      p_session_id: sessionId,
      p_request_id: requestId,
    });
    if (result.error)
      throw new Error(
        'Could not confirm the session ended. Check your connection and retry safely.',
      );
  }
}
