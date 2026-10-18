# Supabase database setup and verification

The database, trusted scheduling Edge Function, shared-password screen, and Angular Supabase adapter are implemented. The app defaults to local mode until configured. Start with [Enable shared mode](SHARED_MODE.md) to choose your password privately and connect the app. See also the [approved design](SUPABASE_PLAN.md) and [Edge scheduling guide](EDGE_SCHEDULING.md).

## What is implemented

- Three ordered migrations in [supabase/migrations](../supabase/migrations/) create the group-scoped tables, RLS policies, constraints, and write operations.
- Players, sessions, publication rosters, completed results, and receipts have stable identities and cross-group foreign-key protection.
- `create_player`, `update_player`, `get_session_snapshot`, and `end_session` are available to authenticated group members. Direct table writes are denied.
- `create_session` and `commit_match_result` are service-only RPCs used by the trusted Edge adapter. They authorize the verified actor explicitly. Do not call them from Angular or grant them to authenticated browsers.
- Confirmations lock the session and atomically complete the match, publish one next assignment, increment revision, and save an immutable receipt. Replay checks precede stale-revision/ended-state checks. Reused request IDs with different payloads and conflicting scores are rejected.
- SQL validates candidate structure and freshness. The Edge adapter calculates candidates using the existing pure TypeScript scheduler. The database does not implement or claim to verify scheduling fairness itself.
- Ending a session cancels its unplayed announced match and preserves completed history. Roster edits, regeneration, corrections, and deletion APIs are intentionally deferred.

All tables exposed by the app have RLS enabled. The browser has no membership-management operation. The `private` schema is not exposed through the Data API. Public signup and anonymous sign-in are disabled in local config; multiple sessions for the shared account remain allowed. Apply the same Auth settings explicitly when provisioning a hosted project, since local `config.toml` does not configure hosted Auth automatically.

## Run the database tests without Docker

Verified on Windows with Node 24.22.0 and npm 11.19.1. From the repository root in VS Code PowerShell:

```powershell
Set-Location 'C:\Users\Nille\Documents\Coding\padel-for-fun'
nvm use 24.22.0
npm.cmd --prefix .\supabase ci
npm.cmd --prefix .\supabase test
```

If your terminal already has Node 24 available, omit `nvm use`. No global PostgreSQL, Supabase CLI, database credentials, or running service are needed for this test command.

Development-only dependencies live in `supabase/`, isolated from the frontend:

| Package | Pinned version | Purpose |
| --- | --- | --- |
| `supabase` | 2.121.0 | Official CLI for the eventual full local stack and migrations |
| `embedded-postgres` | 17.10.0-beta.17 | Launches native PostgreSQL **17.10** for disposable tests; the wrapper package has a beta version |
| `pg` | 8.23.1 | Independent PostgreSQL connections for access and concurrency tests |
| `esbuild` | 0.28.2 | Bundle the Edge adapter and original domain sources for deployment |
| `typescript` | 6.0.3 | Strict Edge type checking, matching the frontend toolchain |
| `vitest` | 5.0.5 | Isolated Edge adapter unit tests |

The [embedded PostgreSQL runner](https://github.com/leinelissen/embedded-postgres) ships platform-specific binaries. The test runner binds a random loopback port, uses an ephemeral generated password, applies migrations to a new disposable cluster, and stops/removes only that cluster afterward. It never reads a hosted database URL or touches your browser's local sessions. `supabase/.test-data/` and dependencies are ignored by Git.

The test-only [bootstrap](../supabase/tests/support/bootstrap.sql) supplies the minimal roles, `auth.users`, and `auth.uid()` contract that real Supabase supplies. It also simulates permissive default grants so migration revocations are tested. **Never apply this bootstrap to a real Supabase database.** It contains no authentication implementation or reusable account password.

The 29 tests cover anonymous/nonmember denial, group isolation, service-only function privileges, controlled player writes, both roster sizes, score boundaries/fractions/nulls, deferred assignment constraints, rollback, immutable history, stale revisions, request and match replay, membership revocation, and idempotent ending. Five concurrency tests use independent native PostgreSQL connections and verify the second request is waiting on a real database lock before releasing the first transaction. These include identical requests, separate same-score requests, conflicting results, and both end/confirm orderings.

On 2026-10-17: **29 database tests passed**, all **109 frontend tests passed**, frontend lint passed, and the production build passed. Database tests took approximately 13 seconds. No database process remained after cleanup.

## Full local Supabase validation

Docker was installed on 2026-10-18; the running Docker Engine reports version 29.8.2. Native database tests validate PostgreSQL logic, permissions, and actual lock contention; they do not validate Supabase Auth login, JWT verification, PostgREST request coercion/role mapping, generated API types, or Edge deployment. Those integration checks remain required before hosted rollout.

Startup verified on 2026-10-18: the Docker stack started successfully, all three migrations applied, Studio responded with HTTP 200, and `db lint --local --level warning` reported no schema errors. The local Supabase PostgreSQL image is `17.11.0.004`. This confirms stack startup and migration/lint compatibility; authenticated end-to-end workflows still need their own validation.

Install and start Docker Desktop with its supported Windows/WSL setup, then follow the [official local development prerequisites](https://supabase.com/docs/guides/local-development/cli/getting-started). The CLI is already pinned locally; no global CLI installation is necessary.

From the repository root:

```powershell
Set-Location 'C:\Users\Nille\Documents\Coding\padel-for-fun'
docker info
npm.cmd --prefix .\supabase run cli -- --version
npm.cmd --prefix .\supabase run build:edge
npm.cmd --prefix .\supabase run cli -- start
npm.cmd --prefix .\supabase run cli -- db lint --local --level warning
```

Open Docker Desktop first and wait until its engine is running. `docker info` should show a Server section. If VS Code cannot find `docker` after installation, reopen its terminal. The project already has its Supabase configuration and installed CLI; there is no need to run `supabase init` again or create containers manually in Docker Desktop.

Starting a fresh local stack applies the repository migrations. The first start downloads Docker images. The CLI prints local connection/key information; do not copy privileged keys into Angular, documentation, or version control.

After startup, open **http://127.0.0.1:54323** for Supabase Studio, the local database/Auth administration interface. The API is **http://127.0.0.1:54321**. Docker Desktop's Containers view shows the project's running services. Future starts reuse the downloaded images and saved local database.

The Angular app is a separate process. To open it, use a second terminal:

```powershell
npm.cmd --prefix .\frontend start
```

Open **http://localhost:4200**. Starting Supabase alone does not change the app's mode. Follow [Shared mode](SHARED_MODE.md) to create the account/group and public frontend configuration; otherwise it uses the original local library.

For a clean migration replay against a disposable local stack:

```powershell
npm.cmd --prefix .\supabase run cli -- db reset --local
```

This reset deletes data in this project's **local Supabase database**. Use it only for a disposable stack whose data you intend to discard. It does not clear browser-local prototype data. None of these commands links or pushes to a hosted project.

After full-stack tests, stop the local services with:

```powershell
npm.cmd --prefix .\supabase run cli -- stop
```

## Preparing the next phase

Create the single shared Auth account through owner-controlled admin tools, with public signups still disabled. Its password is entered at runtime; it is never committed. Seed its group and membership through owner tooling after the account exists. This is intentionally separate from application migrations; there is no production credential seed or automatic local-data import.

The implemented Edge adapter authenticates the caller, reads `get_session_snapshot` under their token, runs the existing scheduler, and calls the service-only commit with the verified actor and expected revision. On SQLSTATE `40001`, it reloads and recomputes with bounded retries. Its HTTP contract and local serving/test commands are in [Edge scheduling](EDGE_SCHEDULING.md). The upcoming frontend adapter should show conflicts clearly, refetch the current session after a receipt, and retry lost responses with the same request ID.

Only the project URL, publishable key, and shared account email identifier belong in frontend configuration. A server secret/service-role credential stays in the Edge environment. After implementing the adapter, test real Auth and concurrent HTTP calls before connecting Angular to hosted storage.
