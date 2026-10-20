# Shared password and Supabase storage

The Angular app supports two explicit modes: **local**, preserving the original browser library, and **supabase**, using the shared account, database, and trusted scheduling Edge Function. Shared mode has a single password field, without registration or individual player accounts.

Current release status and test results are in [the 20 October launch review](LAUNCH_REVIEW.md). For hosting, use [the deployment plan](HOSTING_PLAN.md); the commands below provision local development only. The shared workflow is implemented, but a production configuration guard and server-side one-active-session-per-group constraint remain recommended changes.

## Enable it locally

Open Docker Desktop and run these commands from the repository root:

```powershell
Set-Location 'C:\Users\Nille\Documents\Coding\padel-for-fun'
npm.cmd --prefix .\supabase run build:edge
npm.cmd --prefix .\supabase run cli -- start
npm.cmd --prefix .\supabase run setup:local
```

The setup command privately prompts for your password using PowerShell's secure input. Accept the default local email identifier, or choose another identifier; people using the app never need to enter it. The command creates one confirmed local Auth account and its group/membership, or verifies the existing account's password and reuses its group. It does not change an existing account's password. If `frontend/.env` already exists, it asks before replacing it.

The command is restricted to the running local loopback stack. It never uploads prototype data or connects to a hosted project. Your password goes to local Supabase Auth and is not written to frontend configuration, command-line arguments, or logs.

Start the scheduling function in that terminal:

```powershell
npm.cmd --prefix .\supabase run serve:edge
```

Leave it running. In a second terminal at the repository root:

```powershell
npm.cmd --prefix .\frontend start
```

Restart Angular if it was already running. Open **http://localhost:4200**, enter the shared password, and add your players. The shared library starts empty; your old browser library is preserved separately and is not imported automatically.

On later days, start Docker, the local Supabase stack, the Edge serving command, and Angular. Account setup is needed only when provisioning/changing the local public configuration. A local Docker stack is development infrastructure on this computer; hosted deployment is still needed for the group to access the app conveniently from separate phones.

## Public configuration

`frontend/.env` is ignored by Git. The setup command writes only:

```dotenv
PADEL_STORAGE=supabase
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
PADEL_LOGIN_EMAIL=your-shared-account-email
```

The prestart/prebuild scripts generate ignored `frontend/public/app-config.json` from this allowlist. The public config is fetched and validated before Angular starts. Never put a password, service-role/secret key, or database URL in frontend environment variables. Privileged browser keys are rejected. URLs, publishable keys, and login identifiers are public configuration, not access credentials.

With no `.env`, the development default remains explicit local mode. To return to the old prototype library, set `PADEL_STORAGE=local` and restart Angular. There is no in-app storage switch that could accidentally move an action between libraries. A configured shared app fails closed on missing/invalid runtime config; connection failures never switch it to local writes.

For eventual hosting, set these same public variables in the build environment, provision the single account/group using owner-controlled hosted tooling, deploy the scheduling function, and set its allowed frontend origin. The local setup command is intentionally unsuitable for hosted provisioning. See [the database plan](SUPABASE_PLAN.md) and [Edge guide](EDGE_SCHEDULING.md).

## Workflow and synchronization

- Route guards restore and verify saved sign-in before protected pages load. A requested session/player URL is retained through login. Backend Auth and RLS enforce real access; the browser guard controls navigation only.
- The store selects a local or shared implementation through one typed injection token, so pages retain their existing workflow. Supabase SDK 2.118.0 supplies Auth, token refresh, typed database calls, and Edge invocation.
- The shared adapter resolves exactly one membership, paginates player/session lists, reads complete session snapshots, and validates records into the existing pure domain models. Player/session statistics still derive from completed matches.
- Creation and confirmation call the trusted Edge Function. Ending and player creation call controlled authenticated RPCs. The browser cannot write match tables directly or supply next teams.
- Successful mutations refetch the authoritative current library. The client does not generate an optimistic next match, and a late operation receipt is not treated as the current match.
- Sessions are expected to use one device at a time. Shared data loads on app startup/sign-in and after successful saves, without background polling, refresh on focus, or a manual refresh button. Reload the page when switching to a device that already has the app open.
- Save request UUIDs are retained in sessionStorage by account, backend, and action fingerprint. Unknown outcomes can be retried with the same identifier across reloads. Already visible creation receipts retire their pending request so a later session can use the same roster without replaying an old creation.
- Network and read failures show errors and block unsafe writes. A failed response may still represent a committed transaction; retry safely or reload the page instead of assuming the operation was rolled back. Failed initial loads retain a retry button.
- There is currently no Sign out control in the UI; the browser retains its login. The underlying Auth service still supports sign-out, clearing private data and this browser's Auth cache without signing out other phones. An in-flight request cannot republish private data after sign-out.

Shared mode keeps library records in memory; the SDK stores its session tokens in `padel-americano.auth.v1`. Passwords are not stored by the app. The original `padel-americano.sessions.v1` library is not read or overwritten by shared mode. No automatic cross-mode import, score correction, roster changes, offline mutation queue, PWA installation, or hosted deployment is included in this phase.

## Verification

From the repository root:

```powershell
npm.cmd --prefix .\frontend run lint
npm.cmd --prefix .\frontend test -- --watch=false
npm.cmd --prefix .\frontend run build
npm.cmd --prefix .\supabase run test:browser
```

The browser test requires the local stack, served Edge Function, and an installed Microsoft Edge browser. It serves the production build on `127.0.0.1:4200`, or uses the existing app on that port, and supplies isolated public configuration through browser routing. It creates temporary local Auth/group fixtures and removes only those fixtures afterward. It does not replace your `.env` or choose your real password.

The mobile test covers wrong/correct passwords, redirect restoration, adding players, five- and six-player sessions, stable reloads, simultaneous confirmations from independent browsers, a committed save with a deliberately lost response, safe retry, shared ending, persisted login, and preservation of old local data. Unit tests cover retry persistence, invalid config/privileged keys, unavailable storage, stale in-flight reads after sign-out, and safe auth errors.

Regenerate database definitions after schema changes with:

```powershell
npm.cmd --prefix .\supabase run types:frontend
```

The generated `database.types.ts` is checked by TypeScript. Two style rules are relaxed only for that generated file; application code retains the existing lint rules.

Reviewed on 2026-10-20: frontend lint/build passed; the complete Angular suite had 139 passes and one obsolete header-selector failure. All 29 database tests, 27 Edge unit tests, 8 Edge HTTP integration tests, and the two-browser mobile workflow passed. See [the launch review](LAUNCH_REVIEW.md) for the failure, security findings, and additional review probes. Your permanent local shared account is provisioned only when you run the private password setup command.
