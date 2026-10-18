import { mkdir, writeFile } from 'node:fs/promises';

const mode = process.env.PADEL_STORAGE ?? 'local';
if (!['local', 'supabase'].includes(mode))
  throw new Error('PADEL_STORAGE must be local or supabase.');

const settings = { mode };

if (mode === 'supabase') {
  Object.assign(settings, {
    url: process.env.SUPABASE_URL,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    loginEmail: process.env.PADEL_LOGIN_EMAIL,
  });
  if (!settings.url || !settings.publishableKey || !settings.loginEmail)
    throw new Error('Shared mode requires its public URL, publishable key, and login email.');

  let valid = settings.publishableKey.startsWith('sb_publishable_');
  try {
    const payload = JSON.parse(
      Buffer.from(settings.publishableKey.split('.')[1] ?? '', 'base64url').toString(),
    );
    valid ||= payload.role === 'anon';
  } catch {
    /* Only publishable or legacy anon keys may be written. */
  }

  if (!valid) throw new Error('Refusing to write a privileged or invalid browser key.');
}

await mkdir(new URL('../public/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../public/app-config.json', import.meta.url),
  JSON.stringify(settings, null, 2) + '\n',
);
console.log(`Prepared ${mode} application settings.`);
