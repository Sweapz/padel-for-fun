# Trusted scheduling Edge Function

The `schedule` function is implemented and tested in the local Supabase Edge runtime. It creates a session with its first match and confirms a result while publishing exactly one next match. The Angular shared-mode adapter now calls this function; follow [shared mode setup](SHARED_MODE.md) to enable it. The original local mode remains available.

For current verification results and remaining risks, see [the launch review](LAUNCH_REVIEW.md). The [hosting plan](HOSTING_PLAN.md) describes the proposed deployment; no hosted runtime was verified by that review. The follow-up added migration four: separate creation requests now conflict at the database if another session in the group is active. Same-request and earlier-creation replay remain supported.

## Architecture

Reviewed source lives in [supabase/edge](../supabase/edge/). A development build bundles the **existing** `frontend/src/domain/scheduler.ts`, scoring rules, and Edge adapter into `supabase/functions/schedule/index.js`. The generated artifact is ignored by Git and must be built before serving or deploying. There is no separate scheduling implementation or copied domain directory to keep synchronized.

- `contracts.ts` validates HTTP inputs and maps database snapshots into pure domain records.
- `gateway.ts` makes Auth/RLS reads with the user's token and privileged RPC calls with the server key. It uses the standard Fetch API, without a new runtime SDK dependency.
- `handler.ts` handles creation, confirmation, bounded revision retries, safe errors, body limits, and CORS.
- `index.ts` reads server configuration and starts the Deno handler. Only this file accesses runtime environment variables.

The Edge build/test packages are development-only: esbuild 0.28.2 bundles the shared sources; TypeScript 6.0.3 checks strict types consistently with the frontend; Vitest 5.0.5 runs isolated adapter tests. The Edge bundle has no additional runtime SDK dependency and does not fork the scheduler; the frontend separately uses Supabase SDK 2.118.0 for shared access.

## Authentication and permissions

Each POST requires `Authorization: Bearer <user access token>`. The function verifies the token by calling Supabase Auth's `/auth/v1/user` endpoint, requires an authenticated non-anonymous user, and uses only that verified user ID as the actor. It never trusts a browser-supplied actor, next assignment, or session revision. RLS-scoped reads then enforce group membership. The database checks membership again under the commit lock.

`verify_jwt = false` in this function's local/deployment config delegates verification to the handler's mandatory Auth check. It does **not** enable unauthenticated scheduling. This avoids dependence on the gateway's legacy JWT verification behavior and supports current signing keys. See [Supabase Auth user verification](https://supabase.com/docs/reference/javascript/auth-getuser) and [Edge authentication guidance](https://supabase.com/docs/guides/functions/auth).

Runtime configuration reads the project URL and server-provided publishable/secret keys, with support for the default key maps and legacy local anon/service-role keys. Secrets are never embedded at build time. A new secret key is sent only in `apikey`; a legacy service-role JWT is also sent as Bearer for local compatibility. User tokens are used only for Auth/RLS calls, never as the privileged RPC identity.

`ALLOWED_ORIGINS` is a comma-separated server setting. Its development default is `http://localhost:4200,http://127.0.0.1:4200`. Configure the deployed frontend origin when deploying. CORS limits browser origins; every non-browser call still requires authentication. Responses use `Cache-Control: no-store`. Inputs are limited to 16 KiB and unknown fields are rejected.

## Request contract

Both actions use POST to `/functions/v1/schedule`. Supply JSON content type, the project publishable API key in `apikey`, and the signed-in user's access token in `Authorization`. Generate a request UUID once per user action and preserve it for retries.

Create a session:

```json
{
  "action": "create",
  "groupId": "<group UUID>",
  "playerIds": ["<five or six distinct player UUIDs>"],
  "requestId": "<request UUID>"
}
```

The function verifies available players through RLS, computes the first assignment, and calls the service-only `create_session` RPC. Its receipt returns `sessionId`, `matchId`, and `revision`. A receipt replay occurs before checking current player availability, so a successful request remains replayable even if a player was subsequently archived. Reusing its ID with a different roster conflicts.

Confirm the announced match:

```json
{
  "action": "confirm",
  "sessionId": "<session UUID>",
  "matchId": "<published match UUID>",
  "scoreA": 11,
  "scoreB": 5,
  "requestId": "<request UUID>"
}
```

Scores must pass the existing strict domain validator: integers in range, with the configured combined total. The function reads one consistent RLS-protected snapshot, includes the pending result in scheduler history, and submits the candidate with the snapshot revision. All persistence occurs inside the existing locked `commit_match_result` transaction. A failed insert leaves neither a saved score nor a next match.

On a stale revision (`40001`), reload and recompute up to three times, preserving the request UUID. A completed target goes directly to the database replay/conflict path, even after the session ends; it does not generate a replacement assignment. Identical simultaneous submissions return the same original next-match ID. The response is an operation receipt, so the UI must separately refresh the **current** session rather than assume the receipt's next match is still active.

| HTTP status | Meaning |
| --- | --- |
| 200 | Saved operation or successful replay |
| 400 | Malformed input, invalid score/UUID, duplicate player, or unexpected fields |
| 401 | Missing or invalid user token |
| 403 | Disallowed origin or unavailable group/session/player access |
| 409 | Conflicting operation/result, inactive match, unsupported rules, or exhausted revision retries |
| 413 / 415 | Body too large / JSON content type required |
| 500 / 503 | Invalid stored state, internal failure, or temporarily unavailable upstream service |

Error responses contain `{ "error": { "code": "...", "message": "..." } }`. Internal SQL details, passwords, and tokens are not returned or logged by the adapter. A lost response can be retried with the original request ID.

## Local commands

From the repository root, with Node 24 available:

```powershell
npm.cmd --prefix .\supabase ci
npm.cmd --prefix .\supabase run build:edge
npm.cmd --prefix .\supabase run cli -- start
npm.cmd --prefix .\supabase run serve:edge
```

Keep the serving terminal open. The function is served at `http://127.0.0.1:54321/functions/v1/schedule`. `serve:edge` checks types and rebuilds the bundle before serving. Source edits require rebuilding the bundle; the local runtime reloads its generated entry point. Ctrl+C ends the serving command.

In a second terminal:

```powershell
npm.cmd --prefix .\supabase run test:edge
npm.cmd --prefix .\supabase run test:edge:integration
```

The integration suite only accepts loopback endpoints obtained from this project's local CLI status. It creates isolated test Auth accounts/group/player/session fixtures and removes only those fixtures afterward. Passwords/tokens/privileged keys stay in memory. Cleanup uses a transaction-local trigger bypass solely for the test-owned group's immutable data; it does not alter persistent trigger definitions or other groups. No production shared account is provisioned by these tests.

The integration suite verifies real password login, disabled public registration, invalid tokens/nonmembers, both roster sizes, scheduler parity over eight confirmations, concurrent same-score requests, conflicting results, direct privileged-RPC denial, invalid/spoofed fields, and replay after ending/archiving.

Local Auth configuration needs **global** `auth.enable_signup = false` and **email-provider** `auth.email.enable_signup = true`. In the installed CLI, the latter switches the email provider itself on; disabling it also disables password sign-in. The end-to-end test proves public registration remains blocked. Restart local Supabase after changing these settings, preserving the database with ordinary `stop`/`start`.

The initial Edge phase passed strict type checking/build, 27 unit tests, 8 real local Auth/HTTP integration tests, the 29 database tests, and the then-current 109 frontend tests. The subsequent [shared mode phase](SHARED_MODE.md) adds Angular authentication/persistence and browser coverage. The local runtime reported compatibility with Deno 2.1.4.

On 24 October 2026, `schedule` was rebuilt, type-checked, passed all 27 Edge unit tests, and deployed to hosted project `dnyaptxuxdclkqdotuxw`. Its sole allowed browser origin is `https://padel-for-fun.christopher-hansen-nielsen.workers.dev`. Live probes verified approved-origin preflight (204), rejected-origin preflight (403), and missing/invalid token rejection (401), without writing session data. Authenticated hosted scheduling still needs a complete app workflow check. Exact redeployment commands and remaining setup are in [the hosting plan](HOSTING_PLAN.md).
