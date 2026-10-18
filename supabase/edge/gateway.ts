import { DatabaseError, HttpError, object, uuid } from './contracts';

export interface Gateway {
  verifyUser(token: string): Promise<string>;
  receipt(token: string, groupId: string, requestId: string): Promise<unknown>;
  readPlayers(token: string, groupId: string, ids: string[]): Promise<unknown>;
  snapshot(token: string, sessionId: string): Promise<unknown>;
  commit(
    name: 'create_session' | 'commit_match_result',
    args: Record<string, unknown>,
  ): Promise<unknown>;
}

export interface ApiConfig {
  url: string;
  publicKey: string;
  secretKey: string;
}

/** Each request builds fresh headers; a browser token never becomes the admin identity. */
export class SupabaseGateway implements Gateway {
  constructor(
    private readonly config: ApiConfig,
    private readonly request = fetch,
  ) {}

  private async json(
    path: string,
    key: string,
    token: string | null,
    body?: unknown,
  ): Promise<unknown> {
    const headers = new Headers({ apikey: key, 'Content-Type': 'application/json' });

    if (token) headers.set('Authorization', `Bearer ${token}`);

    let response: Response;

    try {
      response = await this.request(`${this.config.url}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new HttpError(
        503,
        'service_unavailable',
        'The database service is temporarily unavailable.',
      );
    }

    const value: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      if (response.status >= 500) {
        throw new HttpError(
          503,
          'service_unavailable',
          'The database service is temporarily unavailable.',
        );
      }

      const code = value && typeof value === 'object' && 'code' in value ? String(value.code) : '';
      throw new DatabaseError(code);
    }

    return value;
  }

  async verifyUser(token: string): Promise<string> {
    try {
      const value = object(await this.json('/auth/v1/user', this.config.publicKey, token));

      if (value.role !== 'authenticated' || value.is_anonymous === true)
        throw new Error('Invalid user.');

      return uuid(value.id);
    } catch (error) {
      if (error instanceof HttpError && error.status === 503) throw error;

      throw new HttpError(401, 'unauthorized', 'Sign in to continue.');
    }
  }

  readPlayers(token: string, groupId: string, ids: string[]): Promise<unknown> {
    const query = new URLSearchParams({
      select: 'id,archived_at',
      group_id: `eq.${groupId}`,
      id: `in.(${ids.join(',')})`,
    });

    return this.json(`/rest/v1/players?${query}`, this.config.publicKey, token);
  }

  receipt(token: string, groupId: string, requestId: string): Promise<unknown> {
    const query = new URLSearchParams({
      select: 'kind,payload,response',
      group_id: `eq.${groupId}`,
      request_id: `eq.${requestId}`,
    });

    return this.json(`/rest/v1/operation_receipts?${query}`, this.config.publicKey, token);
  }

  snapshot(token: string, sessionId: string): Promise<unknown> {
    return this.json('/rest/v1/rpc/get_session_snapshot', this.config.publicKey, token, {
      p_session_id: sessionId,
    });
  }

  commit(
    name: 'create_session' | 'commit_match_result',
    args: Record<string, unknown>,
  ): Promise<unknown> {
    // New secret keys belong only in apikey; legacy local service-role JWTs also need Bearer.
    const token = this.config.secretKey.startsWith('sb_secret_') ? null : this.config.secretKey;

    return this.json(`/rest/v1/rpc/${name}`, this.config.secretKey, token, args);
  }
}
