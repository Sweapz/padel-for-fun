import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import pg from 'pg';

// Called only by the interactive PowerShell wrapper; the password travels over stdin, never argv.
const root = fileURLToPath(new URL('../', import.meta.url));
let db;
class SetupError extends Error {}

try {
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const credentials = JSON.parse(input.replace(/^\uFEFF/, ''));
  if (
    typeof credentials.email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials.email) ||
    typeof credentials.password !== 'string' ||
    credentials.password.length < 8
  )
    throw new SetupError('Enter a valid email identifier and a password of at least 8 characters.');

  let status;
  try {
    status = JSON.parse(
      execFileSync(
        process.execPath,
        [
          fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js', import.meta.url)),
          '--workdir',
          '..',
          'status',
          '--output',
          'json',
        ],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      ),
    );
  } catch {
    throw new SetupError('Start the local Supabase stack first.');
  }

  if (
    !['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname) ||
    !['127.0.0.1', 'localhost'].includes(new URL(status.DB_URL).hostname)
  )
    throw new SetupError('This command only supports the local loopback stack.');

  const secret = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
  const browserKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
  const adminHeaders = { apikey: secret, 'Content-Type': 'application/json' };
  if (!secret.startsWith('sb_secret_')) adminHeaders.Authorization = `Bearer ${secret}`;

  let user;
  for (let page = 1; ; page++) {
    const response = await fetch(
      `${status.API_URL}/auth/v1/admin/users?page=${page}&per_page=1000`,
      { headers: adminHeaders },
    );
    if (!response.ok) throw new SetupError('Could not inspect local Auth accounts.');
    const data = await response.json();
    user = data.users.find((u) => u.email?.toLowerCase() === credentials.email.toLowerCase());
    if (user || data.users.length < 1000) break;
  }

  if (!user) {
    const response = await fetch(`${status.API_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ ...credentials, email_confirm: true }),
    });
    if (!response.ok) throw new SetupError('Could not create the local shared account.');
    user = await response.json();
  }

  const login = await fetch(`${status.API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: browserKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  if (!login.ok)
    throw new SetupError(
      'Password sign-in failed. An existing account needs its current password; also check the email-provider setting.',
    );

  db = new pg.Client({ connectionString: status.DB_URL });
  await db.connect();
  await db.query('begin');
  const membership = await db.query('select group_id from public.memberships where user_id = $1', [
    user.id,
  ]);
  if (membership.rows.length > 1)
    throw new SetupError('The shared account must belong to exactly one group.');
  if (!membership.rows.length) {
    const group = await db.query(
      "insert into public.groups(name) values ('Your padel group') returning id",
    );
    await db.query('insert into public.memberships(group_id,user_id) values ($1,$2)', [
      group.rows[0].id,
      user.id,
    ]);
  }
  await db.query('commit');

  // Explicit allowlist: the password, token, admin key and DB URL never enter the frontend file.
  await writeFile(
    new URL('../../frontend/.env', import.meta.url),
    [
      'PADEL_STORAGE=supabase',
      `SUPABASE_URL=${JSON.stringify(status.API_URL)}`,
      `SUPABASE_PUBLISHABLE_KEY=${JSON.stringify(browserKey)}`,
      `PADEL_LOGIN_EMAIL=${JSON.stringify(credentials.email)}`,
      '',
    ].join('\n'),
  );
  console.log(
    'Local shared account and group are ready. Public frontend settings were written to frontend/.env.',
  );
  console.log(
    'Run the Edge serving command and restart Angular. Sign in using the password you just entered.',
  );
} catch (error) {
  if (db) await db.query('rollback').catch(() => undefined);
  console.error(
    error instanceof SetupError
      ? error.message
      : 'Local setup failed. Check the local stack and account settings.',
  );
  process.exitCode = 1;
} finally {
  await db?.end();
}
