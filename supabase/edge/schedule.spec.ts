import { describe, expect, it, vi } from 'vitest';
import { createHandler } from './handler';
import { DatabaseError, SCHEDULER_VERSION, RULES_VERSION } from './contracts';
import { SupabaseGateway } from './gateway';
import { scheduleNextMatch } from '../../frontend/src/domain/scheduler';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const ids = [1, 2, 3, 4, 5, 6].map(id);
const sessionId = id(10);
const matchId = id(11);
const requestId = id(12);
const groupId = id(13);
const actor = id(14);

function snapshot(size = 5) {
  return {
    session: {
      id: sessionId,
      status: 'active',
      revision: 0,
      match_points: 16,
      court_count: 1,
      rules_version: RULES_VERSION,
      scheduler_version: SCHEDULER_VERSION,
    },
    players: ids.slice(0, size).map((player_id) => ({ player_id, is_active: true })),
    matches: [
      {
        id: matchId,
        session_id: sessionId,
        sequence: 1,
        status: 'published',
        published_at: '2026-10-18T10:00:00Z',
        participants: ids.slice(0, size).map((player_id, i) => ({
          player_id,
          slot: ['a1', 'a2', 'b1', 'b2', 'rest1', 'rest2'][i],
        })),
      },
    ],
  };
}

function setup(size = 5) {
  const gateway = {
    verifyUser: vi.fn(async () => actor),
    receipt: vi.fn(async (): Promise<unknown> => []),
    readPlayers: vi.fn(async () => ids.slice(0, size).map((id) => ({ id, archived_at: null }))),
    snapshot: vi.fn(async (): Promise<unknown> => snapshot(size)),
    commit: vi.fn(async () => ({ nextMatchId: id(20) })),
  };
  const handler = createHandler(gateway, ['http://localhost:4200']);
  const create = { action: 'create', groupId, playerIds: ids.slice(0, size), requestId };
  const confirm = { action: 'confirm', sessionId, matchId, requestId, scoreA: 8, scoreB: 8 };
  const request = (body: unknown, headers: Record<string, string> = {}) =>
    handler(
      new Request('http://edge/schedule', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer user-token',
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    );

  return { gateway, handler, request, create, confirm };
}

describe('trusted scheduling requests', () => {
  for (const size of [5, 6]) {
    it(`uses the existing ${size}-player scheduler and verified actor on creation`, async () => {
      const { gateway, request, create } = setup(size);

      expect((await request(create)).status).toBe(200);
      expect(gateway.commit).toHaveBeenCalledWith(
        'create_session',
        expect.objectContaining({
          p_actor_id: actor,
          p_assignment: scheduleNextMatch(ids.slice(0, size), []),
          p_request_id: requestId,
        }),
      );
      expect(gateway.readPlayers).toHaveBeenCalledWith('user-token', groupId, ids.slice(0, size));
    });

    it(`derives a ${size}-player next assignment after including the confirmed match`, async () => {
      const { gateway, request, confirm } = setup(size);

      expect((await request(confirm)).status).toBe(200);
      const args = gateway.commit.mock.calls[0] as unknown as [string, Record<string, unknown>];
      const assignment = args[1].p_assignment as ReturnType<typeof scheduleNextMatch>;

      expect(assignment.explanation.appearancesBefore[ids[0]]).toBe(1);
      expect(assignment.explanation.appearancesBefore[ids[4]]).toBe(0);
      expect(assignment.restingPlayerIds).not.toContain(ids[4]);
      expect(args[1].p_expected_revision).toBe(0);
    });
  }

  it('replays creation before checking players that may since have been archived', async () => {
    const { gateway, request, create } = setup();
    gateway.receipt.mockResolvedValue([
      { kind: 'create', payload: { players: create.playerIds }, response: { sessionId } },
    ]);

    expect(await (await request(create)).json()).toEqual({ sessionId });
    expect(gateway.readPlayers).not.toHaveBeenCalled();
    expect(gateway.commit).not.toHaveBeenCalled();
  });

  it('rejects reused creation IDs for a different roster', async () => {
    const { gateway, request, create } = setup();
    gateway.receipt.mockResolvedValue([
      { kind: 'create', payload: { players: ids }, response: {} },
    ]);

    expect((await request(create)).status).toBe(409);
  });

  it('reloads the snapshot and preserves the request ID on a revision conflict', async () => {
    const { gateway, request, confirm } = setup();
    gateway.commit.mockRejectedValueOnce(new DatabaseError('40001'));

    expect((await request(confirm)).status).toBe(200);
    expect(gateway.snapshot).toHaveBeenCalledTimes(2);
    expect(gateway.commit).toHaveBeenCalledTimes(2);
    expect(
      gateway.commit.mock.calls.every(
        (call) =>
          (call as unknown as [string, Record<string, unknown>])[1].p_request_id === requestId,
      ),
    ).toBe(true);
  });

  it('bounds revision retries', async () => {
    const { gateway, request, confirm } = setup();
    gateway.commit.mockRejectedValue(new DatabaseError('40001'));

    expect((await request(confirm)).status).toBe(409);
    expect(gateway.commit).toHaveBeenCalledTimes(3);
  });

  it('lets the database replay completed matches after the session ends', async () => {
    const { gateway, request, confirm } = setup();
    const state = snapshot();
    state.session.status = 'ended';
    state.matches[0].status = 'completed';
    gateway.snapshot.mockResolvedValue(state);

    expect((await request(confirm)).status).toBe(200);
    expect(gateway.commit).toHaveBeenCalledWith(
      'commit_match_result',
      expect.objectContaining({ p_assignment: null }),
    );
  });

  it('rejects an unavailable session and unsupported rules without a privileged commit', async () => {
    const { gateway, request, confirm } = setup();
    gateway.snapshot.mockResolvedValueOnce(null);
    expect((await request(confirm)).status).toBe(403);

    const state = snapshot();
    state.session.match_points = 20;
    gateway.snapshot.mockResolvedValue(state);
    expect((await request(confirm)).status).toBe(409);
    expect(gateway.commit).not.toHaveBeenCalled();
  });

  for (const change of [
    { scoreA: '' },
    { scoreA: null },
    { scoreA: 8.5, scoreB: 7.5 },
    { scoreA: -1, scoreB: 17 },
    { scoreA: 8, scoreB: 7 },
    { actorId: actor },
    { assignment: {} },
    { sessionId: 'invalid' },
  ]) {
    it(`rejects invalid or untrusted fields: ${JSON.stringify(change)}`, async () => {
      const { gateway, request, confirm } = setup();

      expect((await request({ ...confirm, ...change })).status).toBe(400);
      expect(gateway.commit).not.toHaveBeenCalled();
    });
  }

  for (const code of ['42501', '23505', '23514']) {
    it(`maps ${code} to a safe public error`, async () => {
      const { gateway, request, confirm } = setup();
      gateway.commit.mockRejectedValue(new DatabaseError(code));

      const response = await request(confirm);
      expect(response.status).toBe(code === '42501' ? 403 : 409);
      expect(await response.text()).not.toContain('Database operation failed');
    });
  }
});

describe('HTTP and credential boundaries', () => {
  it('returns safe errors for unexpected failures without leaking internal details', async () => {
    const { gateway, request, confirm } = setup();
    gateway.commit.mockRejectedValue(new Error('internal database credentials must stay private'));

    const response = await request(confirm);

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('credentials');
  });

  it('requires a bearer token and denies disallowed origins', async () => {
    const { gateway, request, confirm } = setup();

    expect((await request(confirm, { Authorization: '' })).status).toBe(401);
    expect((await request(confirm, { Origin: 'https://unrelated.example' })).status).toBe(403);
    expect(gateway.verifyUser).not.toHaveBeenCalled();
  });

  it('handles preflight without authentication and restricts methods', async () => {
    const { handler, gateway } = setup();
    const preflight = await handler(
      new Request('http://edge/schedule', {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:4200' },
      }),
    );

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4200');
    expect((await handler(new Request('http://edge/schedule'))).status).toBe(405);
    expect(gateway.verifyUser).not.toHaveBeenCalled();
  });

  it('rejects oversized and malformed JSON bodies', async () => {
    const { handler } = setup();
    const headers = { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' };

    expect(
      (await handler(new Request('http://edge/schedule', { method: 'POST', headers, body: '{' })))
        .status,
    ).toBe(400);
    expect(
      (
        await handler(
          new Request('http://edge/schedule', { method: 'POST', headers, body: ' '.repeat(17000) }),
        )
      ).status,
    ).toBe(413);
  });

  it('sends user tokens only to user reads and secret keys only to privileged commits', async () => {
    const request = vi.fn<typeof fetch>(async () =>
      Response.json({ id: actor, role: 'authenticated' }),
    );
    const api = new SupabaseGateway(
      { url: 'http://api', publicKey: 'public-test-key', secretKey: 'sb_secret_test' },
      request,
    );

    expect(await api.verifyUser('user-token')).toBe(actor);
    await api.snapshot('user-token', sessionId);
    await api.commit('commit_match_result', {});

    expect(new Headers(request.mock.calls[0][1]?.headers).get('Authorization')).toBe(
      'Bearer user-token',
    );
    expect(new Headers(request.mock.calls[1][1]?.headers).get('apikey')).toBe('public-test-key');
    expect(new Headers(request.mock.calls[2][1]?.headers).get('apikey')).toBe('sb_secret_test');
    expect(new Headers(request.mock.calls[2][1]?.headers).has('Authorization')).toBe(false);
  });

  it('rejects invalid Auth responses instead of trusting an unverified token', async () => {
    const api = new SupabaseGateway(
      { url: 'http://api', publicKey: 'public-test-key', secretKey: 'server-test-key' },
      async () => Response.json({ message: 'invalid JWT' }, { status: 401 }),
    );

    await expect(api.verifyUser('forged')).rejects.toMatchObject({ status: 401 });
  });
});
