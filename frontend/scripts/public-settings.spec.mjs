import assert from 'node:assert/strict';
import { it } from 'node:test';
import { mkdtemp, mkdir, copyFile, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { publicSettings } from './public-settings.mjs';

const shared = {
  PADEL_STORAGE: 'supabase',
  SUPABASE_URL: 'https://release-check.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only',
  PADEL_LOGIN_EMAIL: 'group@example.com',
};
const production = { production: true };

it('requires explicit shared mode for production, while development still supports local storage', () => {
  assert.throws(() => publicSettings({}, production), /require PADEL_STORAGE=supabase/);
  assert.throws(
    () => publicSettings({ ...shared, PADEL_STORAGE: 'local' }, production),
    /require PADEL_STORAGE=supabase/,
  );
  assert.deepEqual(publicSettings({}), { mode: 'local' });
  assert.equal(
    publicSettings({ ...shared, SUPABASE_URL: 'http://127.0.0.1:54321' }).mode,
    'supabase',
  );
});

it('allows only complete public settings and normalizes the API origin', () => {
  assert.deepEqual(
    publicSettings(
      { ...shared, SUPABASE_URL: shared.SUPABASE_URL + '/', PRIVATE_SENTINEL: 'not public' },
      production,
    ),
    {
      mode: 'supabase',
      url: shared.SUPABASE_URL,
      publishableKey: shared.SUPABASE_PUBLISHABLE_KEY,
      loginEmail: shared.PADEL_LOGIN_EMAIL,
    },
  );

  for (const name of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'PADEL_LOGIN_EMAIL']) {
    assert.throws(
      () => publicSettings({ ...shared, [name]: '' }, production),
      /requires its public/,
    );
  }

  assert.throws(
    () => publicSettings({ ...shared, PADEL_LOGIN_EMAIL: 'invalid' }, production),
    /email identifier/,
  );
});

for (const url of [
  'http://release-check.supabase.co',
  'http://127.0.0.1:54321',
  'https://localhost',
  'https://project.localhost',
  'https://127.1',
  'https://127.0.0.2',
  'https://0.0.0.0',
  'https://[::1]',
  'https://[::]',
  'https://[::ffff:127.0.0.1]',
  'https://10.0.0.1',
  'https://192.168.1.1',
  'https://172.16.0.1',
  'https://169.254.1.1',
  'https://[fd00::1]',
  'https://[fe80::1]',
  'https://host.docker.internal',
  'https://project.local',
  'https://supabase',
  'https://user:password@release-check.supabase.co',
  'https://release-check.supabase.co/rest/v1',
  'https://release-check.supabase.co?token=invalid',
  'https://release-check.supabase.co#invalid',
  'not a URL',
]) {
  it(`rejects an unsuitable production URL (${url})`, () => {
    assert.throws(() => publicSettings({ ...shared, SUPABASE_URL: url }, production));
  });
}

it('rejects privileged or malformed keys without including their contents in errors', () => {
  const jwt = (role) =>
    `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;

  for (const key of ['sb_secret_test_only', 'sb_publishable_', jwt('service_role'), 'not-a-key']) {
    assert.throws(
      () => publicSettings({ ...shared, SUPABASE_PUBLISHABLE_KEY: key }, production),
      (error) => {
        assert.match(error.message, /privileged or invalid/);
        assert.equal(error.message.includes(key), false);

        return true;
      },
    );
  }

  assert.equal(
    publicSettings({ ...shared, SUPABASE_PUBLISHABLE_KEY: jwt('anon') }, production).mode,
    'supabase',
  );
});

it('fails the generator before replacing config, then writes only public values for valid production settings', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'padel-config-test-'));
  const scripts = path.join(directory, 'scripts');
  const target = path.join(directory, 'public', 'app-config.json');

  try {
    await mkdir(scripts);
    await mkdir(path.dirname(target));

    for (const file of ['generate-config.mjs', 'public-settings.mjs']) {
      await copyFile(new URL(file, import.meta.url), path.join(scripts, file));
    }

    await writeFile(target, 'existing configuration');
    const run = (env) =>
      spawnSync(process.execPath, [path.join(scripts, 'generate-config.mjs'), '--production'], {
        env: { ...process.env, ...env },
        encoding: 'utf8',
      });

    const failed = run({ ...shared, SUPABASE_URL: 'http://127.0.0.1:54321' });

    assert.notEqual(failed.status, 0);
    assert.equal(await readFile(target, 'utf8'), 'existing configuration');

    const success = run({ ...shared, PRIVATE_SENTINEL: 'must not be written' });

    assert.equal(success.status, 0);
    assert.deepEqual(
      JSON.parse(await readFile(target, 'utf8')),
      publicSettings(shared, production),
    );
  } finally {
    if (
      path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) &&
      path.basename(directory).startsWith('padel-config-test-')
    ) {
      await rm(directory, { recursive: true, force: true });
    }
  }
});
