import { InjectionToken } from '@angular/core';

export type RuntimeSettings =
  | { mode: 'local' }
  | {
      mode: 'supabase';
      url: string;
      publishableKey: string;
      loginEmail: string;
    };

export const APP_SETTINGS = new InjectionToken<RuntimeSettings>('Public application settings', {
  providedIn: 'root',
  factory: () => ({ mode: 'local' }),
});

export function parseSettings(value: unknown): RuntimeSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Missing application settings.');

  const data = value as Record<string, unknown>;

  if (data['mode'] === 'local' && Object.keys(data).length === 1) return { mode: 'local' };

  if (
    data['mode'] !== 'supabase' ||
    Object.keys(data).some((k) => !['mode', 'url', 'publishableKey', 'loginEmail'].includes(k)) ||
    typeof data['url'] !== 'string' ||
    typeof data['publishableKey'] !== 'string' ||
    typeof data['loginEmail'] !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data['loginEmail'])
  ) {
    throw new Error('Invalid application settings.');
  }

  const url = new URL(data['url']);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  ) {
    throw new Error('A valid Supabase HTTPS URL is required.');
  }

  const key = data['publishableKey'];
  let validKey = key.startsWith('sb_publishable_');

  if (!validKey) {
    try {
      const payload = JSON.parse(
        atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
      ) as Record<string, unknown>;
      validKey = key.split('.').length === 3 && payload['role'] === 'anon';
    } catch {
      /* Invalid and privileged keys are rejected, never echoed. */
    }
  }

  if (!validKey) throw new Error('Use a publishable browser API key.');

  return { mode: 'supabase', url: url.origin, publishableKey: key, loginEmail: data['loginEmail'] };
}
