import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = fileURLToPath(
  new URL('../../frontend/dist/padel-americano/browser/', import.meta.url),
);
const origin = 'http://127.0.0.1:4200';
const email = `browser-test-${randomUUID()}@example.com`;
const password = `${randomUUID()}A9!`;
const groupId = randomUUID();
let status, db, userId, server, browser;

async function admin(route, body, method = 'POST') {
  const key = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;

  return fetch(`${status.API_URL}/auth/v1/admin/${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

before(
  async () => {
    try {
      status = JSON.parse(
        execFileSync(
          process.execPath,
          [
            path.join(root, 'node_modules/supabase/dist/supabase.js'),
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
      throw new Error('Start local Supabase and serve the schedule function first.');
    }

    assert.ok(['localhost', '127.0.0.1'].includes(new URL(status.API_URL).hostname));
    assert.ok(['localhost', '127.0.0.1'].includes(new URL(status.DB_URL).hostname));
    await readFile(path.join(dist, 'index.html'));
    db = new pg.Client({ connectionString: status.DB_URL });
    await db.connect();
    const created = await admin('users', { email, password, email_confirm: true });
    assert.equal(created.status, 200, 'Could not create temporary browser-test account');
    userId = (await created.json()).id;
    await db.query('insert into public.groups(id,name) values ($1,$2)', [
      groupId,
      `Browser test ${groupId}`,
    ]);
    await db.query('insert into public.memberships(group_id,user_id) values ($1,$2)', [
      groupId,
      userId,
    ]);

    server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, origin).pathname);
        let file = path.resolve(dist, '.' + pathname);
        if (!file.startsWith(path.resolve(dist) + path.sep)) file = path.join(dist, 'index.html');
        let content;
        try {
          content = await readFile(file);
        } catch {
          file = path.join(dist, 'index.html');
          content = await readFile(file);
        }

        response.setHeader(
          'Content-Type',
          {
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.svg': 'image/svg+xml',
          }[path.extname(file)] ?? 'text/html',
        );
        response.end(content);
      } catch {
        response.writeHead(500);
        response.end();
      }
    });
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(4200, '127.0.0.1', resolve);
      });
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      server = null;
      const response = await fetch(origin);
      assert.ok(
        (await response.text()).includes('<app-root'),
        'Port 4200 is occupied by another application',
      );
    }

    browser = await chromium.launch({ channel: 'msedge', headless: true });
  },
  { timeout: 60000 },
);

after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (!db) return;

  try {
    await db.query('begin');
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
    if (userId) assert.equal((await admin(`users/${userId}`, undefined, 'DELETE')).status, 200);
  } finally {
    await db.end();
  }
});

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.route('**/app-config.json', (route) =>
    route.fulfill({
      json: {
        mode: 'supabase',
        url: status.API_URL,
        publishableKey: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
        loginEmail: email,
      },
    }),
  );
  await page.addInitScript(() =>
    localStorage.setItem('padel-americano.sessions.v1', 'local prototype sentinel'),
  );

  return page;
}

async function selectScore(page) {
  await page.getByRole('button', { name: /^Team A score:/ }).click();
  await page.locator('.score-option[data-score="8"]').click();
}

const waitMatch = (page, n) =>
  page.getByRole('heading', { name: `Match ${n}`, exact: true }).waitFor();

it(
  'supports shared mobile sessions, safe retries and sign-out across browsers',
  { timeout: 120000 },
  async () => {
    const one = await newPage();
    const two = await newPage();
    const errors = [];
    one.on('pageerror', (error) => errors.push(error.message));

    await one.goto(origin + '/players');
    await one.waitForURL('**/login?**');
    await one.getByLabel('Password', { exact: true }).fill('incorrect-password');
    await one.getByRole('button', { name: 'Sign in', exact: true }).click();
    await one.getByRole('alert').filter({ hasText: 'Could not sign in' }).waitFor();
    await one.getByLabel('Password', { exact: true }).fill(password);
    await one.getByRole('button', { name: 'Sign in', exact: true }).click();
    await one.waitForURL('**/players');
    assert.equal(
      await one.evaluate((secret) => JSON.stringify(localStorage).includes(secret), password),
      false,
    );

    const names = ['Alice', 'Bo', 'Cleo', 'Dan', 'Eva', 'Finn'];
    for (const name of names) {
      await one.getByLabel('Name', { exact: true }).fill(name);
      await one.getByRole('button', { name: 'Add player', exact: true }).click();
      await one
        .getByRole('status')
        .filter({ hasText: `${name} added.` })
        .waitFor();
    }

    await one.goto(origin + '/session/new');
    for (const name of names.slice(0, 5))
      await one.getByRole('checkbox', { name, exact: true }).check();
    await one.getByRole('button', { name: 'Create session & first match', exact: true }).click();
    await waitMatch(one, 1);
    const sessionPath = new URL(one.url()).pathname;
    await one.reload();
    await waitMatch(one, 1);
    await two.goto(origin + sessionPath);
    await two.getByLabel('Password', { exact: true }).fill(password);
    await two.getByRole('button', { name: 'Sign in', exact: true }).click();
    await waitMatch(two, 1);

    await selectScore(one);
    await selectScore(two);
    await Promise.all(
      [one, two].map((page) =>
        page.getByRole('button', { name: 'Confirm result & next match', exact: true }).click(),
      ),
    );
    await Promise.all([waitMatch(one, 2), waitMatch(two, 2)]);
    const matchCount = await db.query(
      'select count(*)::integer as n from public.matches where session_id = $1',
      [sessionPath.split('/').at(-1)],
    );
    assert.equal(matchCount.rows[0].n, 2);

    const requestIds = [];
    await selectScore(one);
    await one.route('**/functions/v1/schedule', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      requestIds.push(route.request().postDataJSON().requestId);
      await route.fetch();
      await route.abort('failed');
    });
    await one.getByRole('button', { name: 'Confirm result & next match', exact: true }).click();
    await one.getByRole('alert').filter({ hasText: 'Could not confirm the save' }).waitFor();
    await one.unroute('**/functions/v1/schedule');
    one.on('request', (request) => {
      if (request.url().endsWith('/functions/v1/schedule') && request.method() === 'POST')
        requestIds.push(request.postDataJSON().requestId);
    });
    await one.getByRole('button', { name: 'Confirm result & next match', exact: true }).click();
    await waitMatch(one, 3);
    assert.equal(new Set(requestIds).size, 1);

    await one.getByRole('button', { name: 'End session', exact: true }).click();
    await one.getByRole('button', { name: 'End session now', exact: true }).click();
    await one.getByRole('heading', { name: 'Good games.', exact: true }).waitFor();
    await two.reload();
    await two.getByRole('heading', { name: 'Good games.', exact: true }).waitFor();

    await one.goto(origin + '/session/new');
    await one.getByLabel('Group size', { exact: true }).selectOption('6');
    for (const name of names) await one.getByRole('checkbox', { name, exact: true }).check();
    await one.getByRole('button', { name: 'Create session & first match', exact: true }).click();
    await waitMatch(one, 1);
    assert.ok((await one.locator('.resting').innerText()).includes('&'));
    await one.getByRole('button', { name: 'End session', exact: true }).click();
    await one.getByRole('button', { name: 'End session now', exact: true }).click();
    await one.getByRole('heading', { name: 'Good games.', exact: true }).waitFor();

    await one.getByRole('button', { name: 'Menu', exact: true }).click();
    await one.getByRole('button', { name: 'Sign out', exact: true }).click();
    await one.waitForURL('**/login');
    assert.equal(await one.evaluate(() => localStorage.getItem('padel-americano.auth.v1')), null);
    assert.equal(
      await one.evaluate(() => localStorage.getItem('padel-americano.sessions.v1')),
      'local prototype sentinel',
    );
    await one.goto(origin + sessionPath);
    await one.waitForURL('**/login?**');
    await two.reload();
    await two.getByRole('heading', { name: 'Good games.', exact: true }).waitFor();
    assert.deepEqual(errors, []);

    const invalid = await newPage();
    await invalid.unroute('**/app-config.json');
    await invalid.route('**/app-config.json', (route) => route.fulfill({ json: {
      mode: 'supabase', url: status.API_URL, publishableKey: 'sb_secret_not_allowed', loginEmail: email,
    } }));
    await invalid.goto(origin);
    await invalid.getByRole('alert').filter({ hasText: 'The app could not start' }).waitFor();
    assert.equal(await invalid.getByLabel('Password', { exact: true }).count(), 0);
  },
);
