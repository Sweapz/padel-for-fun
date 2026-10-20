import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

const root = fileURLToPath(new URL('../', import.meta.url));
const testRoot = path.join(root, '.test-data');
const actor = randomUUID();
const outsider = randomUUID();
const group = randomUUID();
const otherGroup = randomUUID();
let server, admin, config, databaseDir;
const databaseLogs = [];

async function unusedPort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const port = probe.address().port;

  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function connection() {
  const client = new pg.Client(config);
  await client.connect();
  await client.query("set statement_timeout = '10s'");

  return client;
}

async function transaction(role, user, action) {
  const client = await connection();

  try {
    await client.query('begin');
    // Fixed, test-owned role names only. Actor values remain SQL parameters.
    assert.ok(['authenticated', 'anon', 'service_role'].includes(role));
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [user ?? '']);
    const value = await action(client);
    await client.query('commit');

    return value;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

const member = (action) => transaction('authenticated', actor, action);
const service = (action) => transaction('service_role', null, action);
const scalar = async (client, sql, values = []) => (await client.query(sql, values)).rows[0].value;

function assignment(ids) {
  return {
    teamA: ids.slice(0, 2),
    teamB: ids.slice(2, 4),
    restingPlayerIds: ids.slice(4),
  };
}

async function fixture(size = 5, selectedGroup = group, selectedActor = actor) {
  const ids = [];

  for (let i = 0; i < size; i++) {
    const player = await transaction('authenticated', selectedActor, (c) =>
      scalar(c, 'select to_jsonb(public.create_player($1,$2)) as value', [
        selectedGroup,
        randomUUID(),
      ]),
    );
    ids.push(player.id);
  }

  const requestId = randomUUID();
  const created = await service((c) =>
    scalar(c, 'select public.create_session($1,$2,$3,$4,$5) as value', [
      selectedActor,
      selectedGroup,
      requestId,
      ids,
      assignment(ids),
    ]),
  );

  return {
    ...created,
    ids,
    requestId,
    group: selectedGroup,
    actor: selectedActor,
  };
}

async function confirm(c, f, options = {}) {
  const {
    scoreA = 8,
    scoreB = 8,
    requestId = randomUUID(),
    revision = 0,
    next = assignment(f.ids),
    user = f.actor,
    matchId = f.matchId,
  } = options;

  return scalar(c, 'select public.commit_match_result($1,$2,$3,$4,$5,$6,$7,$8) as value', [
    user,
    f.sessionId,
    matchId,
    requestId,
    scoreA,
    scoreB,
    revision,
    next,
  ]);
}

async function snapshot(f) {
  return transaction('authenticated', f.actor, (c) =>
    scalar(c, 'select public.get_session_snapshot($1) as value', [f.sessionId]),
  );
}

const rejectsCode = (action, code) => assert.rejects(action, (error) => error.code === code);

before(
  async () => {
    await mkdir(testRoot, { recursive: true });
    databaseDir = await mkdtemp(path.join(testRoot, 'postgres-'));
    const port = await unusedPort();
    const password = randomUUID();
    config = {
      host: '127.0.0.1',
      port,
      user: 'postgres',
      password,
      database: 'postgres',
    };
    server = new EmbeddedPostgres({
      databaseDir,
      port,
      user: 'postgres',
      password,
      persistent: true,
      postgresFlags: ['-h', '127.0.0.1'],
      onLog: (message) => databaseLogs.push(String(message)),
      onError: (message) => databaseLogs.push(String(message)),
    });

    await server.initialise();
    await server.start();
    admin = await connection();
    console.log(
      `Database tests: ${(await admin.query('show server_version')).rows[0].server_version}`,
    );
    await admin.query(await readFile(path.join(root, 'tests/support/bootstrap.sql'), 'utf8'));

    for (const name of (await readdir(path.join(root, 'migrations')))
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      try {
        await admin.query('begin');
        await admin.query(await readFile(path.join(root, 'migrations', name), 'utf8'));
        await admin.query('commit');
      } catch (error) {
        await admin.query('rollback');
        throw new Error(`Migration ${name}: ${error.message}`, {
          cause: error,
        });
      }
    }

    await admin.query('insert into auth.users(id) values ($1),($2)', [actor, outsider]);
    await admin.query(
      "insert into public.groups(id,name) values ($1,'Test group'),($2,'Other group')",
      [group, otherGroup],
    );
    await admin.query('insert into public.memberships(group_id,user_id) values ($1,$2),($3,$4)', [
      group,
      actor,
      otherGroup,
      outsider,
    ]);
  },
  { timeout: 60000 },
);

// Independent tests reuse these two fixture groups; preserve history but finish earlier fixtures.
beforeEach(async () => {
  for (const [selectedGroup, selectedActor] of [
    [group, actor],
    [otherGroup, outsider],
  ]) {
    const active = await admin.query(
      "select id from public.sessions where group_id = $1 and status = 'active'",
      [selectedGroup],
    );

    for (const session of active.rows) {
      await transaction('authenticated', selectedActor, (c) =>
        c.query('select public.end_session($1,$2)', [session.id, randomUUID()]),
      );
    }
  }
});

after(async () => {
  await admin?.end();
  await server?.stop();

  // Delete only the unique disposable cluster created by this test invocation.
  if (databaseDir && path.dirname(path.resolve(databaseDir)) === path.resolve(testRoot)) {
    await rm(databaseDir, { recursive: true, force: true });
  }
});

describe('group access and write boundaries', () => {
  it('enables RLS on every application table and exposes only scoped rows', async () => {
    const f = await fixture();
    const foreign = await fixture(6, otherGroup, outsider);
    const tables = [
      'groups',
      'memberships',
      'players',
      'sessions',
      'session_players',
      'matches',
      'match_participants',
      'operation_receipts',
      'match_confirmations',
    ];

    for (const table of tables) {
      const result = await admin.query(
        'select relrowsecurity from pg_class where oid = $1::regclass',
        [`public.${table}`],
      );
      assert.equal(result.rows[0].relrowsecurity, true);
      await rejectsCode(
        () => transaction('anon', null, (c) => c.query(`select * from public.${table}`)),
        '42501',
      );
      const own = await member((c) => c.query(`select * from public.${table}`));
      assert.ok(own.rows.length > 0 || table === 'match_confirmations');
      assert.ok(
        own.rows.every((row) => (table === 'groups' ? row.id === group : row.group_id === group)),
      );
    }

    assert.equal(
      await member((c) =>
        scalar(c, 'select public.get_session_snapshot($1) as value', [foreign.sessionId]),
      ),
      null,
    );
    assert.equal((await snapshot(f)).players.length, 5);
    const nonmember = randomUUID();
    await admin.query('insert into auth.users(id) values ($1)', [nonmember]);

    for (const table of tables) {
      assert.equal(
        (
          await transaction('authenticated', nonmember, (c) =>
            c.query(`select * from public.${table}`),
          )
        ).rowCount,
        0,
      );
    }
  });

  it('denies direct member writes and trusted RPC execution', async () => {
    const f = await fixture();
    const writes = [
      ['insert into public.memberships(group_id,user_id) values ($1,$2)', [otherGroup, actor]],
      ['update public.matches set score_a = 1 where id = $1', [f.matchId]],
      ['delete from public.match_participants where match_id = $1', [f.matchId]],
      ["insert into public.players(group_id,name) values ($1,'Bypass')", [group]],
    ];

    for (const [sql, values] of writes) {
      await rejectsCode(() => member((c) => c.query(sql, values)), '42501');
    }
    await rejectsCode(() => member((c) => confirm(c, f)), '42501');
    await rejectsCode(
      () =>
        member((c) =>
          scalar(c, 'select public.create_session($1,$2,$3,$4,$5) as value', [
            actor,
            group,
            randomUUID(),
            f.ids,
            assignment(f.ids),
          ]),
        ),
      '42501',
    );
    await rejectsCode(() => service((c) => confirm(c, f, { user: outsider })), '42501');
    await rejectsCode(
      () => member((c) => c.query("select public.create_player($1,'Intruder')", [otherGroup])),
      '42501',
    );
    await rejectsCode(
      () =>
        transaction('anon', null, (c) =>
          c.query("select public.create_player($1,'Intruder')", [group]),
        ),
      '42501',
    );
  });

  it('supports validated names and archiving without rewriting snapshots', async () => {
    const f = await fixture();
    const oldName = (await snapshot(f)).players[0].display_name_snapshot;
    await member((c) =>
      c.query('select public.update_player($1,$2,true)', [f.ids[0], '  Renamed  ']),
    );

    assert.equal((await snapshot(f)).players[0].display_name_snapshot, oldName);
    await rejectsCode(
      () =>
        service((c) =>
          scalar(c, 'select public.create_session($1,$2,$3,$4,$5) as value', [
            actor,
            group,
            randomUUID(),
            f.ids,
            assignment(f.ids),
          ]),
        ),
      '23514',
    );
    await rejectsCode(
      () => member((c) => c.query("select public.create_player($1,'   ')", [group])),
      '23514',
    );
    const name = randomUUID();
    await member((c) => c.query('select public.create_player($1,$2)', [group, name]));
    await rejectsCode(
      () =>
        member((c) => c.query('select public.create_player($1,$2)', [group, name.toUpperCase()])),
      '23505',
    );
  });
});

describe('atomic confirmation and idempotency', () => {
  for (const size of [5, 6]) {
    it(`creates and confirms a ${size}-player session with one next match`, async () => {
      const f = await fixture(size);
      const createReplay = await service((c) =>
        scalar(c, 'select public.create_session($1,$2,$3,$4,$5) as value', [
          actor,
          group,
          f.requestId,
          f.ids,
          null,
        ]),
      );
      assert.equal(createReplay.sessionId, f.sessionId);

      const receipt = await service((c) => confirm(c, f));
      const state = await snapshot(f);

      assert.equal(state.session.revision, 1);
      assert.equal(state.matches.filter((m) => m.status === 'completed').length, 1);
      assert.equal(state.matches.filter((m) => m.status === 'published').length, 1);
      assert.equal(state.matches[1].id, receipt.nextMatchId);
      assert.equal(state.matches[1].participants.length, size);
    });
  }

  for (const [scoreA, scoreB] of [
    [0, 16],
    [16, 0],
    [8, 8],
  ]) {
    it(`accepts ${scoreA}–${scoreB}`, async () => {
      const f = await fixture();
      const result = await service((c) => confirm(c, f, { scoreA, scoreB }));

      assert.equal(result.scoreA, scoreA);
      assert.equal(result.scoreB, scoreB);
    });
  }

  for (const [scoreA, scoreB] of [
    [-1, 17],
    [17, -1],
    [8, 7],
    [8.5, 7.5],
    [null, 16],
    ['NaN', 16],
    ['Infinity', 0],
  ]) {
    it(`rejects invalid scores ${scoreA}/${scoreB} without partial writes`, async () => {
      const f = await fixture();
      const before = await snapshot(f);

      await rejectsCode(() => service((c) => confirm(c, f, { scoreA, scoreB })), '23514');
      assert.deepEqual(await snapshot(f), before);
    });
  }

  it('rolls back completion when next participants are invalid', async () => {
    const f = await fixture();
    const before = await snapshot(f);
    const invalid = assignment(f.ids);
    invalid.teamB[0] = invalid.teamA[0];

    await rejectsCode(() => service((c) => confirm(c, f, { next: invalid })), '23514');
    assert.deepEqual(await snapshot(f), before);
  });

  it('replays request IDs and same-match aliases after later matches and session end', async () => {
    const f = await fixture();
    const requestId = randomUUID();
    const first = await service((c) => confirm(c, f, { requestId }));
    const aliasId = randomUUID();
    assert.deepEqual(
      await service((c) => confirm(c, f, { requestId: aliasId, next: null })),
      first,
    );
    await service((c) => confirm(c, f, { matchId: first.nextMatchId, revision: 1 }));
    await member((c) => c.query('select public.end_session($1,$2)', [f.sessionId, randomUUID()]));

    assert.deepEqual(await service((c) => confirm(c, f, { requestId, next: null })), first);
    await rejectsCode(() => service((c) => confirm(c, f, { scoreA: 9, scoreB: 7 })), '23505');
    await rejectsCode(
      () => service((c) => confirm(c, f, { requestId: aliasId, matchId: first.nextMatchId })),
      '23505',
    );
    assert.equal((await snapshot(f)).matches.length, 3);
  });

  it('rejects stale revisions and reused operation IDs without changing state', async () => {
    const f = await fixture();
    const before = await snapshot(f);

    await rejectsCode(() => service((c) => confirm(c, f, { revision: 99 })), '40001');
    await rejectsCode(() => service((c) => confirm(c, f, { requestId: f.requestId })), '23505');
    assert.deepEqual(await snapshot(f), before);
  });
});

describe('database invariants at commit', () => {
  it('rejects unsupported rosters, foreign players and malformed initial assignments', async () => {
    const f = await fixture(6);
    const foreign = await fixture(5, otherGroup, outsider);
    await member((c) => c.query('select public.end_session($1,$2)', [f.sessionId, randomUUID()]));
    const cases = [
      { ids: f.ids.slice(0, 4), next: assignment(f.ids.slice(0, 4)) },
      { ids: [...f.ids, f.ids[0]], next: assignment(f.ids) },
      { ids: [foreign.ids[0], ...f.ids.slice(1)], next: assignment(f.ids) },
      { ids: f.ids, next: { ...assignment(f.ids), teamA: [f.ids[0]] } },
      { ids: f.ids, next: { ...assignment(f.ids), restingPlayerIds: [] } },
    ];
    const count = await scalar(admin, 'select count(*)::integer as value from public.sessions');

    for (const entry of cases) {
      await rejectsCode(
        () =>
          service((c) =>
            scalar(c, 'select public.create_session($1,$2,$3,$4,$5) as value', [
              actor,
              group,
              randomUUID(),
              entry.ids,
              entry.next,
            ]),
          ),
        '23514',
      );
    }

    assert.equal(
      await scalar(admin, 'select count(*)::integer as value from public.sessions'),
      count,
    );
  });

  it('rejects a second published match, incomplete teams and duplicate slots at the database layer', async () => {
    const f = await fixture();

    await rejectsCode(
      () =>
        admin.query('insert into public.matches(group_id,session_id,sequence) values ($1,$2,2)', [
          group,
          f.sessionId,
        ]),
      '23505',
    );

    await admin.query('begin');
    const inserted = await admin.query(
      "insert into public.matches(group_id,session_id,sequence,status,cancelled_at) values ($1,$2,2,'cancelled',now()) returning id",
      [group, f.sessionId],
    );
    await rejectsCode(() => admin.query('commit'), '23514');
    await admin.query('rollback');
    assert.equal((await snapshot(f)).matches.length, 1);

    await admin.query('begin');
    const match = await admin.query(
      "insert into public.matches(group_id,session_id,sequence,status,cancelled_at) values ($1,$2,2,'cancelled',now()) returning id",
      [group, f.sessionId],
    );
    await admin.query(
      "insert into public.match_participants(group_id,session_id,match_id,player_id,slot) values ($1,$2,$3,$4,'a1')",
      [group, f.sessionId, match.rows[0].id, f.ids[0]],
    );
    await rejectsCode(
      () =>
        admin.query(
          "insert into public.match_participants(group_id,session_id,match_id,player_id,slot) values ($1,$2,$3,$4,'a1')",
          [group, f.sessionId, match.rows[0].id, f.ids[1]],
        ),
      '23505',
    );
    await admin.query('rollback');
    assert.ok(inserted.rows[0].id);
  });

  it('makes ending a session idempotent and keeps its original receipt stable', async () => {
    const f = await fixture();
    const requestId = randomUUID();
    const end = (id) =>
      member((c) => scalar(c, 'select public.end_session($1,$2) as value', [f.sessionId, id]));

    const first = await end(requestId);

    assert.deepEqual(await end(requestId), first);
    assert.deepEqual(await end(randomUUID()), first);
    assert.equal((await snapshot(f)).session.revision, 1);
    await rejectsCode(
      () => member((c) => c.query('select public.end_session($1,$2)', [f.sessionId, f.requestId])),
      '23505',
    );
  });

  it('rejects an incomplete session at commit', async () => {
    await admin.query('begin');
    await admin.query('insert into public.sessions(group_id) values ($1)', [group]);
    await rejectsCode(() => admin.query('commit'), '23514');
    await admin.query('rollback');
  });

  it('rejects cross-group references, duplicate slots and historical edits', async () => {
    const f = await fixture();
    const foreign = await fixture(5, otherGroup, outsider);

    await rejectsCode(
      () =>
        admin.query(
          'insert into public.session_players(group_id,session_id,player_id,display_name_snapshot,roster_order) values ($1,$2,$3,$4,6)',
          [group, f.sessionId, foreign.ids[0], 'Foreign'],
        ),
      '23503',
    );
    await rejectsCode(
      () =>
        admin.query(
          "update public.match_participants set slot = 'a2' where match_id = $1 and slot = 'a1'",
          [f.matchId],
        ),
      '23514',
    );
    await service((c) => confirm(c, f));
    await rejectsCode(
      () =>
        admin.query('update public.matches set score_a = 9, score_b = 7 where id = $1', [
          f.matchId,
        ]),
      '23514',
    );
    await rejectsCode(
      () => admin.query('delete from public.matches where id = $1', [f.matchId]),
      '23514',
    );
    await rejectsCode(
      () =>
        admin.query(
          'update public.sessions set match_points = 20, revision = revision + 1 where id = $1',
          [f.sessionId],
        ),
      '23514',
    );
  });

  it('denies replay after membership removal', async () => {
    const f = await fixture(5, otherGroup, outsider);
    const requestId = randomUUID();
    await service((c) => confirm(c, f, { requestId }));
    await admin.query('delete from public.memberships where group_id = $1 and user_id = $2', [
      otherGroup,
      outsider,
    ]);

    try {
      await rejectsCode(() => service((c) => confirm(c, f, { requestId })), '42501');
      assert.equal(await snapshot(f), null);
    } finally {
      await admin.query('insert into public.memberships(group_id,user_id) values ($1,$2)', [
        otherGroup,
        outsider,
      ]);
    }
  });
});

async function waitForLock(pid) {
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    const result = await admin.query(
      'select wait_event_type from pg_stat_activity where pid = $1',
      [pid],
    );
    if (result.rows[0]?.wait_event_type === 'Lock') return;

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  assert.fail('Second independent connection did not block on the session lock');
}

async function blockedRace(f, first, second) {
  const a = await connection();
  const b = await connection();

  try {
    for (const c of [a, b]) {
      await c.query('begin');
      await c.query('set local role service_role');
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [actor]);
    }
    // Service role may call end only in this test through SET ROLE authenticated.
    const setMember = async (c) => c.query('set local role authenticated');
    const firstResult = await first(a, setMember);
    const pid = (await b.query('select pg_backend_pid() as pid')).rows[0].pid;
    const pending = second(b, setMember).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await waitForLock(pid);
    await a.query('commit');
    const secondResult = await pending;

    if (secondResult.error) await b.query('rollback');
    else await b.query('commit');

    return { firstResult, secondResult };
  } finally {
    await a.query('rollback');
    await b.query('rollback');
    await a.end();
    await b.end();
  }
}

describe('real simultaneous submissions on independent connections', () => {
  for (const disjoint of [false, true]) {
    it(`allows only one competing creation with ${disjoint ? 'disjoint' : 'the same'} rosters`, async () => {
      const f = await fixture(6);
      await member((c) => c.query('select public.end_session($1,$2)', [f.sessionId, randomUUID()]));
      const secondIds = [];

      if (disjoint) {
        for (let i = 0; i < 5; i++) {
          const player = await member((c) =>
            scalar(c, 'select to_jsonb(public.create_player($1,$2)) as value', [
              group,
              randomUUID(),
            ]),
          );
          secondIds.push(player.id);
        }
      } else secondIds.push(...f.ids);

      const firstRequest = randomUUID();
      const secondRequest = randomUUID();
      const create = (c, ids, requestId) =>
        scalar(c, 'select public.create_session($1,$2,$3,$4,$5) as value', [
          actor,
          group,
          requestId,
          ids,
          assignment(ids),
        ]);
      const before = await scalar(
        admin,
        'select count(*)::int as value from public.sessions where group_id=$1',
        [group],
      );

      const { firstResult, secondResult } = await blockedRace(
        f,
        (c) => create(c, f.ids, firstRequest),
        (c) => create(c, secondIds, secondRequest),
      );

      assert.equal(secondResult.error?.code, '23505');
      assert.equal(secondResult.error?.constraint, 'sessions_one_active_per_group');
      assert.equal(
        await scalar(
          admin,
          "select count(*)::int as value from public.sessions where group_id=$1 and status='active'",
          [group],
        ),
        1,
      );
      assert.equal(
        await scalar(
          admin,
          'select count(*)::int as value from public.sessions where group_id=$1',
          [group],
        ),
        before + 1,
      );
      assert.equal(
        await scalar(
          admin,
          'select count(*)::int as value from public.operation_receipts where group_id=$1 and request_id=$2',
          [group, secondRequest],
        ),
        0,
      );
      assert.equal(
        await scalar(
          admin,
          'select count(*)::int as value from public.matches where session_id=$1',
          [firstResult.sessionId],
        ),
        1,
      );
    });
  }

  it('replays identical simultaneous creation requests and older creations while another session is active', async () => {
    const f = await fixture();
    await member((c) => c.query('select public.end_session($1,$2)', [f.sessionId, randomUUID()]));
    const requestId = randomUUID();
    const create = (c, id) =>
      scalar(c, 'select public.create_session($1,$2,$3,$4,$5) as value', [
        actor,
        group,
        id,
        f.ids,
        assignment(f.ids),
      ]);

    const { firstResult, secondResult } = await blockedRace(
      f,
      (c) => create(c, requestId),
      (c) => create(c, requestId),
    );
    const replay = await service((c) => create(c, f.requestId));

    assert.deepEqual(secondResult.value, firstResult);
    assert.equal(replay.sessionId, f.sessionId);
    assert.equal((await snapshot(f)).session.status, 'ended');
    assert.equal(
      await scalar(
        admin,
        "select id as value from public.sessions where group_id=$1 and status='active'",
        [group],
      ),
      firstResult.sessionId,
    );
  });

  it('serializes two connections retrying the identical request ID', async () => {
    const f = await fixture(6);
    const requestId = randomUUID();

    const { firstResult, secondResult } = await blockedRace(
      f,
      (c) => confirm(c, f, { requestId }),
      (c) => confirm(c, f, { requestId }),
    );

    assert.deepEqual(secondResult.value, firstResult);
    assert.equal((await snapshot(f)).matches.length, 2);
  });

  it('serializes same-match submissions and returns one next match', async () => {
    const f = await fixture();
    const { firstResult, secondResult } = await blockedRace(
      f,
      (c) => confirm(c, f),
      (c) => confirm(c, f),
    );

    assert.deepEqual(secondResult.value, firstResult);
    assert.equal((await snapshot(f)).matches.length, 2);
  });

  it('serializes conflicting scores and rejects the second result', async () => {
    const f = await fixture();
    const { secondResult } = await blockedRace(
      f,
      (c) => confirm(c, f),
      (c) => confirm(c, f, { scoreA: 9, scoreB: 7 }),
    );

    assert.equal(secondResult.error?.code, '23505');
    assert.equal((await snapshot(f)).matches[0].score_a, 8);
  });

  it('end-first cancels the announced match and rejects a racing confirmation', async () => {
    const f = await fixture();
    const { secondResult } = await blockedRace(
      f,
      async (c, setMember) => {
        await setMember(c);
        return scalar(c, 'select public.end_session($1,$2) as value', [f.sessionId, randomUUID()]);
      },
      (c) => confirm(c, f),
    );

    assert.equal(secondResult.error?.code, '23505');
    const state = await snapshot(f);
    assert.equal(state.session.status, 'ended');
    assert.deepEqual(
      state.matches.map((m) => m.status),
      ['cancelled'],
    );
  });

  it('confirm-first preserves the result while racing end cancels only the next match', async () => {
    const f = await fixture();
    const { secondResult } = await blockedRace(
      f,
      (c) => confirm(c, f),
      async (c, setMember) => {
        await setMember(c);
        return scalar(c, 'select public.end_session($1,$2) as value', [f.sessionId, randomUUID()]);
      },
    );

    assert.equal(secondResult.error, undefined);
    const state = await snapshot(f);
    assert.equal(state.session.status, 'ended');
    assert.deepEqual(
      state.matches.map((m) => m.status),
      ['completed', 'cancelled'],
    );
  });
});

describe('active-session migration safety', () => {
  it('refuses legacy duplicate active sessions without choosing or ending any history', async () => {
    const f = await fixture();
    const migration = await readFile(
      path.join(root, 'migrations/20261020000100_one_active_session_per_group.sql'),
      'utf8',
    );

    await admin.query('begin');

    try {
      // Simulate an old installation only inside this disposable transaction.
      await admin.query('drop index public.sessions_one_active_per_group');
      await scalar(admin, 'select public.create_session($1,$2,$3,$4,$5) as value', [
        actor,
        group,
        randomUUID(),
        f.ids,
        assignment(f.ids),
      ]);
      await admin.query('savepoint before_migration');
      await rejectsCode(() => admin.query(migration), '23514');
      await admin.query('rollback to savepoint before_migration');

      assert.equal(
        await scalar(
          admin,
          "select count(*)::int as value from public.sessions where group_id=$1 and status='active'",
          [group],
        ),
        2,
      );
      assert.equal(
        await scalar(admin, "select to_regclass('public.sessions_one_active_per_group') as value"),
        null,
      );
    } finally {
      await admin.query('rollback');
    }

    assert.equal((await snapshot(f)).session.status, 'active');
    assert.notEqual(
      await scalar(admin, "select to_regclass('public.sessions_one_active_per_group') as value"),
      null,
    );
  });
});
