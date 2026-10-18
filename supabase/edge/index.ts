import { createHandler } from './handler';
import { SupabaseGateway } from './gateway';

// Only the runtime entry point knows about Deno or environment secrets.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

function key(direct: string, map: string, fallback: string): string {
  const configured = Deno.env.get(direct);
  if (configured) return configured;

  const encoded = Deno.env.get(map);

  if (encoded) {
    const keys: unknown = JSON.parse(encoded);

    if (keys && typeof keys === 'object' && 'default' in keys && typeof keys.default === 'string') {
      return keys.default;
    }
  }

  const legacy = Deno.env.get(fallback);
  if (legacy) return legacy;

  throw new Error('Required server API key is not configured.');
}

const url = Deno.env.get('SUPABASE_URL');
if (!url) throw new Error('Server API URL is not configured.');

const gateway = new SupabaseGateway({
  url: url.replace(/\/$/, ''),
  publicKey: key('SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'),
  secretKey: key('SUPABASE_SECRET_KEY', 'SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'),
});
const origins = (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:4200,http://127.0.0.1:4200')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

Deno.serve(createHandler(gateway, origins));
