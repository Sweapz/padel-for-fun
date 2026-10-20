import { isIP } from 'node:net';

function isLocalAddress(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  )
    return true;

  if (isIP(host) === 4) {
    const [first, second] = host.split('.').map(Number);

    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }

  if (isIP(host) === 6) {
    return (
      host === '::' ||
      host === '::1' ||
      host.startsWith('::ffff:') ||
      /^(fc|fd|fe[89ab])/.test(host)
    );
  }

  return !host.includes('.');
}

/** Public configuration only; errors deliberately never echo supplied values. */
export function publicSettings(env, { production = false } = {}) {
  if (production && env.PADEL_STORAGE !== 'supabase') {
    throw new Error(
      'Production builds require PADEL_STORAGE=supabase explicitly. Use build:local for development.',
    );
  }

  const mode = env.PADEL_STORAGE ?? 'local';
  if (!['local', 'supabase'].includes(mode))
    throw new Error('PADEL_STORAGE must be local or supabase.');
  if (mode === 'local') return { mode };

  const {
    SUPABASE_URL: urlValue,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    PADEL_LOGIN_EMAIL: loginEmail,
  } = env;

  if (!urlValue || !publishableKey || !loginEmail) {
    throw new Error('Shared mode requires its public URL, publishable key, and login email.');
  }

  let url;

  try {
    url = new URL(urlValue);
  } catch {
    throw new Error('A valid Supabase API URL is required.');
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  ) {
    throw new Error('Use a Supabase HTTPS origin, or loopback HTTP for local development.');
  }

  if (production && (url.protocol !== 'https:' || isLocalAddress(url.hostname))) {
    throw new Error(
      'Production builds require a remote HTTPS Supabase API, not a local or private address.',
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail))
    throw new Error('A valid shared login email identifier is required.');

  let valid =
    publishableKey.startsWith('sb_publishable_') &&
    publishableKey.length > 'sb_publishable_'.length;

  if (!valid) {
    try {
      const parts = publishableKey.split('.');
      const payload = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString());
      valid = parts.length === 3 && payload.role === 'anon';
    } catch {
      /* Only publishable or legacy anon keys may be written. */
    }
  }

  if (!valid) throw new Error('Refusing to write a privileged or invalid browser key.');

  return { mode, url: url.origin, publishableKey, loginEmail };
}
