import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

// This suite only targets the running local stack. Never accept a hosted URL from env.
const root = fileURLToPath(new URL('../', import.meta.url));
let api, publicKey, adminKey, db, token, outsiderToken, actor, groupId;
const createdUsers = [];
const playerIds = [];

async function apiRequest(route, { key = publicKey, bearer, body, method = 'POST' } = {}) {
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const response = await fetch(`${api}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const value = await response.json().catch(() => null);

  return { status: response.status, value };
}

const edge = (body, bearer = token) => apiRequest('/functions/v1/schedule', { body, bearer });

async function newUser() {
  const email = `edge-test-${randomUUID()}@example.com`;
  const password = `${randomUUID()}A9!`;
  const created = await apiRequest('/auth/v1/admin/users', {
    key: adminKey,
    bearer: adminKey.startsWith('sb_secret_') ? undefined : adminKey,
    body: { email, password, email_confirm: true },
  });
  assert.equal(created.status, 200, 'Local Auth account creation failed');
  const id = created.value.id;
  createdUsers.push(id);
  const login = await apiRequest('/auth/v1/token?grant_type=password', {
    body: { email, password },
  });
  assert.equal(
    login.status,
    200,
    `Local Auth login failed (${login.value?.error_code ?? login.value?.error ?? 'unknown'})`,
  );
  assert.equal(typeof login.value.access_token, 'string');

  return { id, token: login.value.access_token };
}

async function rpc(name, body, bearer = token) {
  const result = await apiRequest(`/rest/v1/rpc/${name}`, { body, bearer });
  assert.equal(result.status, 200, `${name} failed with HTTP ${result.status}`);

  return result.value;
}

async function createSession(size = 5) {
  const input = {
    action: 'create',
    groupId,
    playerIds: playerIds.slice(0, size),
    requestId: randomUUID(),
  };
  const result = await edge(input);
  assert.equal(result.status, 200, `Edge creation failed with HTTP ${result.status}`);

  return { input, receipt: result.value };
}

function confirmInput(created, overrides = {}) {
  return {
    action: 'confirm',
    sessionId: created.receipt.sessionId,
    matchId: created.receipt.matchId,
    requestId: randomUUID(),
    scoreA: 8,
    scoreB: 8,
    ...overrides,
  };
}

const snapshot = (id) => rpc('get_session_snapshot', { p_session_id: id });

before(
  async () => {
    let status;

    try {
      const cli = path.join(root, 'node_modules/supabase/dist/supabase.js');
      const output = execFileSync(
        process.execPath,
        [cli, '--workdir', '..', 'status', '--output', 'json'],
        {
          cwd: root,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      status = JSON.parse(output);
    } catch {
      throw new Error(
        'Start the local Supabase stack and serve the schedule function before integration tests.',
      );
    }

    api = status.API_URL;
    publicKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
    adminKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
    assert.ok(
      ['127.0.0.1', 'localhost'].includes(new URL(api).hostname),
      'Integration suite only permits loopback API',
    );
    assert.ok(
      ['127.0.0.1', 'localhost'].includes(new URL(status.DB_URL).hostname),
      'Integration suite only permits loopback database',
    );
    assert.ok(publicKey && adminKey, 'Local API credentials unavailable');
    db = new pg.Client({ connectionString: status.DB_URL });
    await db.connect();
    const user = await newUser();
    actor = user.id;
    token = user.token;
    outsiderToken = (await newUser()).token;
    groupId = randomUUID();
    await db.query('insert into public.groups(id,name) values ($1,$2)', [
      groupId,
      `Edge integration ${groupId}`,
    ]);
    await db.query('insert into public.memberships(group_id,user_id) values ($1,$2)', [
      groupId,
      actor,
    ]);

    for (let index = 0; index < 6; index++) {
      const player = await rpc('create_player', {
        p_group_id: groupId,
        p_name: `Edge player ${index + 1}`,
      });
      playerIds.push(player.id);
    }
  },
  { timeout: 60000 },
);

beforeEach(async () => {
  const active = await db.query(
    "select id from public.sessions where group_id=$1 and status='active'",
    [groupId],
  );

  for (const session of active.rows) {
    await rpc('end_session', {
      p_session_id: session.id,
      p_request_id: randomUUID(),
    });
  }
});

after(async () => {
  if (!db) return;

  try {
    if (groupId) {
      await db.query('begin');
      // Test-owned group only. Transaction-local trigger bypass permits removing our immutable
      // fixtures without changing any other group's rows or persistent trigger definitions.
      await db.query("set local session_replication_role = 'replica'");

      for (const table of [
        'match_confirmations',
        'operation_receipts',
        'match_participants',
        'matches',
        'session_players',
        'sessions',
        'players',
        'memberships',
      ]) {
        await db.query(`delete from public.${table} where group_id = $1`, [groupId]);
      }

      await db.query('delete from public.groups where id = $1', [groupId]);
      await db.query('commit');
    }

    for (const userId of createdUsers) {
      const deleted = await apiRequest(`/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        key: adminKey,
        bearer: adminKey.startsWith('sb_secret_') ? undefined : adminKey,
      });
      assert.equal(deleted.status, 200, 'Local test account cleanup failed');
    }
  } catch (error) {
    await db.query('rollback');
    throw error;
  } finally {
    await db.end();
  }
});

describe('local Auth, Edge runtime, RLS and transactional scheduling', () => {
  it('permits password sign-in for provisioned accounts while public signup stays disabled', async () => {
    const result = await apiRequest('/auth/v1/signup', {
      body: {
        email: `edge-test-${randomUUID()}@example.com`,
        password: `${randomUUID()}A9!`,
      },
    });

    assert.equal(result.status, 422);
    assert.equal(result.value.error_code, 'signup_disabled');
  });

  it('rejects missing/forged tokens and a real authenticated nonmember', async () => {
    const input = {
      action: 'create',
      groupId,
      playerIds: playerIds.slice(0, 5),
      requestId: randomUUID(),
    };

    assert.equal((await edge(input, '')).status, 401);
    assert.equal((await edge(input, 'forged-token')).status, 401);
    assert.equal((await edge(input, outsiderToken)).status, 403);
  });

  for (const size of [5, 6]) {
    it(`creates and advances a real ${size}-player session; retries publish no extra matches`, async () => {
      const created = await createSession(size);
      assert.deepEqual((await edge(created.input)).value, created.receipt);
      const input = confirmInput(created, { scoreA: 16, scoreB: 0 });
      const confirmed = await edge(input);
      assert.equal(confirmed.status, 200);
      assert.deepEqual((await edge(input)).value, confirmed.value);
      const state = await snapshot(created.receipt.sessionId);

      assert.equal(state.session.revision, 1);
      assert.equal(state.matches.length, 2);
      assert.equal(state.matches[0].score_a, 16);
      assert.equal(state.matches[1].status, 'published');
      assert.equal(state.matches[1].participants.length, size);
      const previousRest = state.matches[0].participants
        .filter((p) => p.slot.startsWith('rest'))
        .map((p) => p.player_id);
      assert.ok(
        state.matches[1].participants
          .filter((p) => p.slot.startsWith('rest'))
          .every((p) => !previousRest.includes(p.player_id)),
      );
    });
  }

  it('uses the exact domain scheduler assignment over a resumed sequence', async () => {
    // Import the bundled implementation in a subprocess-free test build, keeping the oracle tied
    // to the actual domain source without maintaining a second scheduling algorithm.
    const { build } = await import('esbuild');
    const { outputFiles } = await build({
      entryPoints: [
        fileURLToPath(new URL('../../frontend/src/domain/scheduler.ts', import.meta.url)),
      ],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
    });
    const { scheduleNextMatch } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`
    );
    const created = await createSession(6);

    for (let match = 0; match < 8; match++) {
      const state = await snapshot(created.receipt.sessionId);
      const published = state.matches.find((m) => m.status === 'published');
      const confirmed = await edge(confirmInput(created, { matchId: published.id }));
      assert.equal(confirmed.status, 200);
      const next = await snapshot(created.receipt.sessionId);
      const history = next.matches
        .filter((m) => m.status === 'completed')
        .map((m) => ({
          id: m.id,
          sessionId: m.session_id,
          sequence: m.sequence,
          status: 'completed',
          publishedAt: m.published_at,
          teamA: ['a1', 'a2'].map((slot) => m.participants.find((p) => p.slot === slot).player_id),
          teamB: ['b1', 'b2'].map((slot) => m.participants.find((p) => p.slot === slot).player_id),
          restingPlayerIds: m.participants
            .filter((p) => p.slot.startsWith('rest'))
            .map((p) => p.player_id),
          result: {
            scores: { teamA: m.score_a, teamB: m.score_b },
            confirmedAt: m.confirmed_at,
          },
        }));
      const expected = scheduleNextMatch(playerIds, history);
      const active = next.matches.find((m) => m.status === 'published');

      assert.deepEqual(
        ['a1', 'a2'].map((slot) => active.participants.find((p) => p.slot === slot).player_id),
        expected.teamA,
      );
      assert.deepEqual(
        ['b1', 'b2'].map((slot) => active.participants.find((p) => p.slot === slot).player_id),
        expected.teamB,
      );
    }
  });

  it('handles simultaneous same-score requests and rejects a conflicting result', async () => {
    const created = await createSession();
    const input = confirmInput(created);
    const [a, b] = await Promise.all([edge(input), edge({ ...input, requestId: randomUUID() })]);

    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.deepEqual(a.value, b.value);
    assert.equal((await snapshot(created.receipt.sessionId)).matches.length, 2);
    assert.equal(
      (await edge({ ...input, requestId: randomUUID(), scoreA: 9, scoreB: 7 })).status,
      409,
    );
  });

  it('rejects invalid input and assignment/actor spoofing without writes', async () => {
    const created = await createSession();
    const input = confirmInput(created);

    for (const fields of [
      { scoreA: 8.5, scoreB: 7.5 },
      { scoreA: '' },
      { p_actor_id: actor },
      { assignment: {} },
    ]) {
      assert.equal((await edge({ ...input, ...fields })).status, 400);
    }

    const direct = await apiRequest('/rest/v1/rpc/commit_match_result', {
      bearer: token,
      body: {
        p_actor_id: actor,
        p_session_id: input.sessionId,
        p_match_id: input.matchId,
        p_request_id: input.requestId,
        p_score_a: 8,
        p_score_b: 8,
        p_expected_revision: 0,
        p_assignment: null,
      },
    });
    assert.ok(
      [401, 403, 404].includes(direct.status),
      'Browser must not execute privileged commit',
    );
    assert.equal((await snapshot(input.sessionId)).matches.length, 1);
  });

  it('rejects a distinct concurrent session creation, permits the next after ending, and replays older requests', async () => {
    const first = {
      action: 'create',
      groupId,
      playerIds: playerIds.slice(0, 5),
      requestId: randomUUID(),
    };
    const second = {
      ...first,
      playerIds: playerIds.slice(1, 6),
      requestId: randomUUID(),
    };

    const results = await Promise.all([edge(first), edge(second)]);

    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    const winnerIndex = results.findIndex((result) => result.status === 200);
    const winner = results[winnerIndex].value;
    const originalInput = [first, second][winnerIndex];
    assert.equal(
      (
        await db.query(
          "select count(*)::int as count from public.sessions where group_id=$1 and status='active'",
          [groupId],
        )
      ).rows[0].count,
      1,
    );
    assert.deepEqual((await edge(originalInput)).value, winner);

    await rpc('end_session', {
      p_session_id: winner.sessionId,
      p_request_id: randomUUID(),
    });
    const next = await createSession(6);

    assert.notEqual(next.receipt.sessionId, winner.sessionId);
    assert.deepEqual((await edge(originalInput)).value, winner);
    assert.equal((await snapshot(next.receipt.sessionId)).session.status, 'active');
  });

  it('replays after ending and after archiving a creation player', async () => {
    const created = await createSession();
    const input = confirmInput(created);
    const confirmed = await edge(input);
    assert.equal(confirmed.status, 200);
    await rpc('end_session', {
      p_session_id: input.sessionId,
      p_request_id: randomUUID(),
    });
    assert.deepEqual((await edge(input)).value, confirmed.value);
    await rpc('update_player', {
      p_player_id: playerIds[0],
      p_name: 'Archived edge fixture',
      p_archive: true,
    });

    assert.deepEqual((await edge(created.input)).value, created.receipt);
  });
});
