# First-release review — 20 October 2026

[Project overview](../README.md) · [Code and feature overview](APP_OVERVIEW.md) · [Proposed hosting steps](HOSTING_PLAN.md)

Recommendation: prepare a hosted staging release, but do not publish the local development artifact. The three initial code findings have now been fixed: production configuration is guarded, the database enforces one active session per group, and the obsolete test selector is corrected. Security headers are now generated and browser-tested locally. Hosted Auth/Pages/function configuration, live headers, and operational recovery still need verification.

The initial review inspected frontend/domain sources, the Edge adapter, the original three migrations, development scripts, dependencies, tests, and documentation. The follow-up added and verified migration four. Both used the local Docker stack and a separate disposable PostgreSQL cluster. No hosted project, domain, production headers, deployed secrets, backups, or cloud account settings were inspected. This is a source/local integration review, not a penetration-test certification.

The initial review changed documentation only. The subsequent authorized follow-up implemented the three fixes below and applied the new migration to local Supabase without resetting data. No hosted settings or credentials were changed. The initial two review probes used temporary local accounts/groups, removed their fixtures, and removed the ignored probe script afterward.

## Implemented follow-up

On 24 October 2026, the checkout was linked to hosted Supabase project `dnyaptxuxdclkqdotuxw`. The four migrations were previewed, applied, and verified against remote migration history. No local records were imported. Hosted account/group provisioning, Auth settings, Edge deployment, Cloudflare integration, and live workflow verification remain pending. The earlier paragraphs describe the scope of the original 20 October review.

The frontend now generates Cloudflare security/cache headers and uses Angular production autoCsp for scripts. A new isolated headless Edge test serves the optimized output with those headers, verifies lazy navigation and player creation, and confirms an injected HTML script is blocked. Current checks: 140 Angular tests, 29 configuration tests, 27 Edge unit tests, the hosting browser test, lint, optimized local build, and Edge type check/bundle passed. The unchanged database and Auth/Edge integration suites retain the earlier verification evidence below; they were not rerun against the hosted project.

- `npm run build` now validates explicit shared mode, a remote HTTPS origin, valid email/key format, and complete allowlisted public configuration before Angular runs. Local/private addresses, embedded URL credentials, API paths, and invalid keys are rejected. This is a configuration check, not a live connectivity/key-verification request. `npm run build:local` is the explicit development-only alternative, retaining the same optimized Angular compilation for browser tests.
- Migration `20261020000100_one_active_session_per_group.sql` adds a partial unique index on active `sessions(group_id)`. It protects competing requests even for disjoint rosters. Same-request replay and replay of earlier ended creations still work. Existing duplicate active sessions make the migration stop with an explanation; no history is silently ended or changed.
- The shell test now checks `.site-header button` instead of every nested header button. The ranking info control is therefore no longer mistaken for a navigation control.
- Verification: **140 Angular tests, 28 configuration tests, 33 database tests, 27 Edge unit tests, and 9 real Auth/Edge HTTP tests passed**. Lint, the optimized local build, and the mobile browser workflow passed. The guarded production command correctly rejected the real loopback development settings. Valid production generation was exercised in an isolated temporary directory; no hosted production build/deployment was performed.

## Findings and current disposition

| Priority | Finding and evidence | Recommended next change |
| --- | --- | --- |
| Fixed in code | The initial build defaulted to local mode or accepted loopback settings without a production check. | The normal production command now rejects these settings. Use actual hosted variables for release and `build:local` only for development. Do not bypass the guard with direct `ng build` or publish the development artifact. |
| Release blocker | Hosted migrations are applied, but no complete hosted deployment is verified. Hosted Auth, function origins, membership provisioning, backups, and live headers still need checks. Header generation is implemented; there is no release pipeline. | Follow [the hosting plan](HOSTING_PLAN.md), set actual origins/Auth settings, provision one account/group, and verify the deployed URL before sharing it. Serve only Angular's `browser/` output. |
| Fixed in code/local database | The initial HTTP probe demonstrated two active sessions from distinct creation requests. | The new unique index rejects the loser with a conflict. Real lock-contention tests cover identical, same-roster, and disjoint-roster requests. Deploy migration four to each intended hosted database as part of rollout. |
| Fixed | The initial frontend suite had 139 passes and one obsolete selector failure. | The selector is scoped to the shell header; all 140 Angular tests now pass. |
| Operational requirement | There is no verified hosted backup/restore or shared-account recovery procedure. The local setup helper is deliberately restricted to loopback. | Choose an owner-controlled recovery email and strong shared password, establish backup/export retention and a restore check, and document how to revoke sessions after a lost phone or leaked password. Decide whether the first hosted database starts empty or needs a reviewed import of existing data. |

Evidence locations:

- [Mode/config generation](../frontend/scripts/generate-config.mjs), [production validation](../frontend/scripts/public-settings.mjs), [runtime validation](../frontend/src/app/data/runtime-settings.ts), and [bootstrap](../frontend/src/main.ts).
- [Client active-session guard](../frontend/src/app/data/shared-session-store.ts), [create RPC](../supabase/migrations/20261017000300_session_operations.sql), [base constraints](../supabase/migrations/20261017000100_group_session_schema.sql), and [group active-session index](../supabase/migrations/20261020000100_one_active_session_per_group.sql).
- [Failing assertion](../frontend/src/app/app.spec.ts), [leaderboard info header](../frontend/src/app/components/clubhouse-leaderboard/clubhouse-leaderboard.html).
- [Edge origins](../supabase/edge/index.ts) and [local Auth configuration](../supabase/config.toml).

## Security findings and accepted tradeoffs

**Shared credentials mean shared account control.** A temporary authenticated account successfully changed its password through `/auth/v1/user`, without any settings screen. Local `secure_password_change` is false. Even with stronger hosted reauthentication settings, people who know the same credentials share the same identity. They cannot manage group membership through this app, but they can use the account's supported Auth operations. Keep administrative recovery separate from the group. This matches the approved single-account model; it does not require personal logins unless the trust requirement changes. See [Supabase's authenticated password-update API](https://supabase.com/docs/reference/javascript/auth-updateuser).

**Remembered login remains intentional.** The SDK persists tokens and renews access automatically. Local access tokens last one hour, with no configured maximum session lifetime or inactivity timeout. There is no Sign out button, by request. Anyone with access to an already signed-in phone can act as the group. Removing the button does not remove the Auth service's sign-out method. Hosted session settings must be checked separately. Revoking a refresh session should not be assumed to invalidate every issued JWT instantly; see [Supabase session behavior](https://supabase.com/docs/guides/auth/sessions).

**Browser tokens make XSS prevention important.** Authentication tokens in localStorage can be read by JavaScript on the same origin. The reviewed application uses Angular binding and does not use `innerHTML`, sanitizer bypasses, `eval`, or dynamic script evaluation in application code. I found no direct XSS path in that inspection. Angular autoCsp and generated Cloudflare headers now provide script restrictions, framing restrictions, MIME sniffing protection, and a no-referrer policy; local browser verification passes. Verify the actual deployed responses before release. See [Angular security guidance](https://angular.dev/best-practices/security) and [Cloudflare response headers](https://developers.cloudflare.com/pages/configuration/headers/).

**CORS is not the security boundary.** The Edge handler accepts only configured browser origins; requests without an Origin header still need a verified user and group access. Default origins are local development URLs. Set the exact hosted origin before use. `verify_jwt = false` delegates token verification to the handler's mandatory Auth request; it does not make scheduling anonymous.

**Rate limits need separate review.** Supabase Auth has authentication rate limits, but the app does not implement per-account quotas on creating players/sessions or confirming matches. An authorized or compromised shared account could create excessive records or requests. For this small trusted group, configure provider usage alerts and review Auth limits first; consider application write limits if exposure grows. Restricting CORS alone will not stop scripted calls. See [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).

**Static code is public; private records are protected by the backend.** Password gating protects database access, not downloading the JavaScript, public project URL, publishable key, or login identifier. These public values are expected. Service-role/secret credentials belong only in the Edge runtime. Owner Supabase/Cloudflare accounts should have MFA without adding an MFA flow to the shared application login.

## Protections verified

- RLS is enabled on all application tables, including receipts. Anonymous callers and real authenticated nonmembers were denied. Cross-group references and membership-management attempts are constrained.
- Browser roles cannot write application tables directly or execute service-only creation/score-commit functions. Controlled member operations check membership. Privileged SQL uses fixed search paths and explicit grants/revokes.
- The Edge handler verifies the caller with Auth, rejects spoofed actor/assignment fields, validates UUIDs and integer scores, bounds request bodies to 16 KiB, and returns generic internal errors.
- Match confirmation is one database transaction: lock, replay/conflict check, completion, exactly one next match, revision, and immutable receipt. Concurrency and rollback tests passed.
- Completed scores and published participants are protected against ordinary edits. An ended session has no published match; cancelled unplayed assignments remain in the database for history integrity.
- Shared mode does not silently fall back to browser-local writes on a failed request. It retains retry UUIDs and refetches saved data after writes.
- No service-role JWT or long secret-key pattern was found in tracked files or the reviewed production assets. Only `.env.example` is tracked; the actual `.env` and public generated config are ignored. The production output had no source maps. This pattern scan is not a complete secret scan of Git history or cloud configuration.
- `npm audit --json` reported **0 advisories** for both installed dependency trees, including development dependencies, on the review date. This is a registry snapshot, not a guarantee about all vulnerabilities.

## Keep, remove, or isolate development features

| Item | Current use | Recommendation |
| --- | --- | --- |
| Browser-local player/session store | `LocalSessionStore` reads/writes `padel-americano.sessions.v1` in localStorage, bypassing shared login by design. | Keep only as an explicit development/test mode. The supported production build now rejects it; removing the adapter remains optional cleanup. |
| Auth token localStorage | `padel-americano.auth.v1` lets a phone stay signed in. | Keep for the requested remembered login. It is not a local-only record database and does not store the password. |
| Retry sessionStorage | `padel-americano.pending.v1:...` retains operation IDs per browser tab/account/backend. | Keep. It helps make uncertain writes safe to retry after a reload. This is not an offline queue of completed scores. |
| Shared records in memory | Loaded players, snapshots, and derived tables/charts. | Keep. Supabase remains the persistent record store. |
| Local-format validation helpers | `decodeSnapshot` reuses `parseSessionLibrary`; shared creation also reuses domain validation. | Keep or rename/refactor carefully. Do not delete everything named `local` without checking shared imports. |
| Docker, Studio, local mail catcher, native test PostgreSQL | Local backend development and isolated tests. | Keep off the public deployment. They are not needed on players' phones or as services for Cloudflare Pages. Do not expose the development stack to the internet. |
| CLI, esbuild, Playwright, test dependencies | Migration/bundle generation and release checks. | Keep in the repository/tooling installation; deploy artifacts rather than repository roots or `node_modules`. |
| Generated Edge bundle | Actual trusted scheduling code deployed to Supabase. | Keep building before deploy; it is ignored by Git and is not regenerated merely by running the frontend build. |

The current browser-local library, the local Docker database, and the eventual hosted database are **three separate data stores**. There is no automatic import between them. Local-mode removal must not discard data without an explicit preservation decision.

## Product and maintenance improvements to consider

These are not demonstrated remote-access vulnerabilities:

- No audited score-correction flow exists. A confirmed typo cannot be fixed through the app. Decide whether to add corrections before using real competitive records; preserve the announced next match when implementing it.
- Player rename/archive RPCs exist, but there is no corresponding UI. Deletion, roster changes during play, regeneration, and reopening ended sessions are also unsupported.
- Every shared load fetches the entire session library, one snapshot per session in batches of five. A save triggers another full load. This is reasonable for the first small group but will grow in latency and bandwidth. Later load current data separately and page older sessions, while preserving correct all-time aggregates.
- Statistics and rankings are computed from raw history, including earlier sessions, with no saved places or winner flags. Raw average finishing place treats fifth in a five-player roster differently from fifth in a six-player roster only through the raw number, not a percentile. There is no minimum-session qualification; one good session can top the leaderboard. These are current product choices, not implementation errors.
- There is no cross-device polling or Realtime subscription, deliberately. Reload when handing over to a device that was already open. The atomic backend must still handle accidental overlapping requests.
- No PWA/service worker, offline reads/writes, or installable manifest is implemented. Present v1 as a phone-friendly website, not an offline app.
- Global loading/saving banners, preview labels, player-added messages, and Sign out were removed by request. Buttons still disable during writes and errors/retry controls remain. Consider a delayed loading indicator only if actual hosted latency causes confusion.
- Add a CI release gate for frontend lint/tests/build, database tests, Edge checks/tests, and a staging smoke test. Currently no CI workflow is checked in, so failures can be missed between targeted test runs.

## Initial review verification results (before the fixes)

| Check | Result on 20 October 2026 |
| --- | --- |
| Frontend lint | Passed |
| Frontend production build | Passed; initial output approximately 482.93 kB raw, below the current 500 kB warning budget |
| Complete Angular suite | **139 passed, 1 failed**, across 19 files; failing selector described above |
| Disposable PostgreSQL tests | 29 passed, including actual lock-contention races |
| Edge strict type check / bundle | Passed |
| Edge unit tests | 27 passed |
| Real local Auth/Edge/RLS HTTP tests | 8 passed |
| Mobile two-browser workflow | Passed |
| Additional local review probes | 2 passed, confirming the duplicate-active-session gap and authenticated password-change capability |
| npm audit, frontend and backend tooling | 0 reported advisories in each tree |
| Hosted configuration and live-domain security | Not inspected or verified |

The initial table is retained as review evidence; current follow-up status is recorded above. Next: complete hosted account/settings, Pages/function deployment, recovery/backups, and live acceptance checks using the hosting plan. Applying hosted migrations does not establish that the complete app is ready for use.
