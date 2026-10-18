import { scheduleNextMatch } from '../../frontend/src/domain/scheduler';
import {
  assertSupportedRules,
  completedMatch,
  DatabaseError,
  HttpError,
  object,
  parseRequest,
  parseSnapshot,
  SCHEDULER_VERSION,
  snapshotRoster,
} from './contracts';
import type { ScheduleRequest } from './contracts';
import type { Gateway } from './gateway';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_ATTEMPTS = 3;

async function readJson(request: Request): Promise<unknown> {
  if (
    request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
  ) {
    throw new HttpError(415, 'invalid_content_type', 'Send a JSON request.');
  }

  const reader = request.body?.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let size = 0;

  if (!reader) throw new HttpError(400, 'invalid_request', 'Request body required.');

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;

      size += chunk.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new HttpError(413, 'request_too_large', 'Request body is too large.');
      }

      text += decoder.decode(chunk.value, { stream: true });
    }

    return JSON.parse(text + decoder.decode()) as unknown;
  } catch (error) {
    if (error instanceof HttpError) throw error;

    throw new HttpError(400, 'invalid_request', 'Invalid JSON request.');
  } finally {
    reader.releaseLock();
  }
}

async function schedule(
  gateway: Gateway,
  token: string,
  actor: string,
  input: ScheduleRequest,
): Promise<unknown> {
  if (input.action === 'create') {
    const receipts = await gateway.receipt(token, input.groupId, input.requestId);

    if (!Array.isArray(receipts) || receipts.length > 1)
      throw new Error('Invalid stored receipts.');

    if (receipts.length) {
      const receipt = object(receipts[0]);
      const payload = object(receipt.payload);

      if (
        receipt.kind !== 'create' ||
        JSON.stringify(payload.players) !== JSON.stringify(input.playerIds)
      ) {
        throw new HttpError(
          409,
          'conflict',
          'This request ID was already used for another operation.',
        );
      }

      return receipt.response;
    }

    const players = await gateway.readPlayers(token, input.groupId, input.playerIds);

    if (
      !Array.isArray(players) ||
      players.length !== input.playerIds.length ||
      players.some(
        (p) => !input.playerIds.includes(object(p).id as string) || object(p).archived_at !== null,
      ) ||
      new Set(players.map((p) => object(p).id)).size !== input.playerIds.length
    ) {
      throw new HttpError(403, 'invalid_roster', 'Choose available players from your group.');
    }

    return gateway.commit('create_session', {
      p_actor_id: actor,
      p_group_id: input.groupId,
      p_request_id: input.requestId,
      p_player_ids: input.playerIds,
      p_assignment: scheduleNextMatch(input.playerIds, []),
      p_scheduler_version: SCHEDULER_VERSION,
    });
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const value = await gateway.snapshot(token, input.sessionId);

    if (value === null) throw new HttpError(403, 'session_unavailable', 'Session unavailable.');

    let snapshot;

    try {
      snapshot = parseSnapshot(value, input.sessionId);
    } catch {
      throw new HttpError(500, 'invalid_stored_session', 'The stored session could not be read.');
    }

    const target = snapshot.matches.find((match) => match.id === input.matchId);

    if (!target) throw new HttpError(409, 'match_unavailable', 'Refresh to see the current match.');

    let assignment = null;

    // A completed match goes straight to the database replay/conflict path, even after ending.
    if (target.status !== 'completed') {
      assertSupportedRules(snapshot.session);

      if (snapshot.session.status !== 'active' || target.status !== 'published') {
        throw new HttpError(409, 'match_unavailable', 'This match is no longer active.');
      }

      try {
        const history = snapshot.matches
          .filter((match) => match.status === 'completed')
          .map((match) => completedMatch(match, input.sessionId));
        const pending = completedMatch(
          {
            ...target,
            status: 'completed',
            score_a: input.scoreA,
            score_b: input.scoreB,
            confirmed_at: new Date().toISOString(),
          },
          input.sessionId,
        );
        assignment = scheduleNextMatch(snapshotRoster(snapshot), [...history, pending]);
      } catch {
        throw new HttpError(
          500,
          'invalid_stored_session',
          'The stored session could not be scheduled.',
        );
      }
    }

    try {
      return await gateway.commit('commit_match_result', {
        p_actor_id: actor,
        p_session_id: input.sessionId,
        p_match_id: input.matchId,
        p_request_id: input.requestId,
        p_score_a: input.scoreA,
        p_score_b: input.scoreB,
        p_expected_revision: snapshot.session.revision,
        p_assignment: assignment,
        p_scheduler_version: SCHEDULER_VERSION,
      });
    } catch (error) {
      if (!(error instanceof DatabaseError) || error.code !== '40001') throw error;
    }
  }

  throw new HttpError(
    409,
    'stale_session',
    'The session changed. Refresh and retry with the same request ID.',
  );
}

function publicError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;

  if (error instanceof DatabaseError) {
    if (error.code === '42501') return new HttpError(403, 'forbidden', 'Group access denied.');
    if (error.code === '23505')
      return new HttpError(
        409,
        'conflict',
        'This request conflicts with a saved result or operation.',
      );
    if (['23514', '23503', '22023', '22P02'].includes(error.code)) {
      return new HttpError(
        409,
        'invalid_state',
        'The session or players changed. Refresh and try again.',
      );
    }
  }

  return new HttpError(500, 'internal_error', 'The request could not be completed.');
}

export function createHandler(
  gateway: Gateway,
  origins: readonly string[],
): (request: Request) => Promise<Response> {
  return async (request) => {
    const origin = request.headers.get('Origin');
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    });

    if (origin && origins.includes(origin)) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set(
        'Access-Control-Allow-Headers',
        'authorization, apikey, content-type, x-client-info',
      );
      headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    }

    try {
      if (origin && !origins.includes(origin))
        throw new HttpError(403, 'origin_denied', 'Origin not allowed.');
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (request.method !== 'POST') {
        headers.set('Allow', 'POST, OPTIONS');
        throw new HttpError(405, 'method_not_allowed', 'Use POST.');
      }

      const bearer = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];

      if (!bearer) throw new HttpError(401, 'unauthorized', 'Sign in to continue.');

      const actor = await gateway.verifyUser(bearer);
      const input = parseRequest(await readJson(request));
      const result = await schedule(gateway, bearer, actor, input);

      return new Response(JSON.stringify(result), { status: 200, headers });
    } catch (error) {
      const failure = publicError(error);

      return new Response(
        JSON.stringify({ error: { code: failure.code, message: failure.message } }),
        {
          status: failure.status,
          headers,
        },
      );
    }
  };
}
