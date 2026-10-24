# Proposed first hosted release

[Launch review](LAUNCH_REVIEW.md) · [App overview](APP_OVERVIEW.md) · [Local shared setup](SHARED_MODE.md)

Hosted preparation started on 24 October 2026. The checkout is linked to Supabase project `dnyaptxuxdclkqdotuxw` (`https://dnyaptxuxdclkqdotuxw.supabase.co`), and all four migrations have been applied and their remote versions verified. The GitHub repository is `Sweapz/padel-for-fun`. Cloudflare account creation is complete, but Pages/GitHub integration, hosted Auth provisioning, and function deployment are still pending. No frontend URL has been deployed or verified.

## Next steps for this project

1. In the Supabase dashboard, open Authentication settings: keep email/password enabled, disable new-user signup and anonymous sign-ins, and retain multiple concurrent sessions. These hosted settings are separate from the local configuration file.
2. Under Authentication → Users, create one confirmed user with an owner-controlled email and the shared password. Enter the password privately in the dashboard; do not send it in chat. Copy the user's UUID. There is no need to create accounts for individual players.
3. In the project's SQL Editor, run the following once, replacing the UUID with that Auth user's ID. This creates the app group and links the shared login. Do not rerun it to create another group for the same account: the app requires exactly one membership.

```sql
with created_group as (
  insert into public.groups (name)
  values ('padel for fun')
  returning id
)
insert into public.memberships (group_id, user_id)
select id, 'REPLACE_WITH_AUTH_USER_UUID'::uuid
from created_group;
```

4. Find the project's **publishable key** in its API Keys settings. Only the publishable key (or legacy `anon` key) belongs in the frontend. Keep secret/service-role keys private.
5. In Cloudflare, open **Workers & Pages**, choose **Create application → Pages → Connect to Git** (labels may vary), authorize GitHub access to `Sweapz/padel-for-fun`, and select that repository. Choose the branch containing the latest application and hosting changes. The local changes must be committed and pushed before Cloudflare can build them.
6. Use the settings table below. Set `NODE_VERSION=24.22.0` as a build variable, and set the four public application variables before deploying. Use `https://dnyaptxuxdclkqdotuxw.supabase.co` for `SUPABASE_URL`. Do not enable production-connected builds on untrusted preview branches.
7. After Pages allocates its `https://<project>.pages.dev` address, use that exact origin for Supabase Auth Site URL and `ALLOWED_ORIGINS`, then deploy the scheduling function using the commands below. The frontend can be built first, but session creation/confirmation will not work until the function is deployed and its origin configured.
8. Complete the hosted acceptance checks before sharing the URL. Existing local records are not automatically uploaded; the hosted group starts empty.

The shared account email, publishable key, and Pages origin are still needed to finish configuration. None is the shared password. Keep local `frontend/.env` settings unchanged for local development; use Cloudflare build variables for hosted configuration.

## Hosting arrangement

- Cloudflare Pages serves the Angular production assets over HTTPS.
- A hosted Supabase project provides PostgreSQL, Auth, the Data API, and the trusted `schedule` Edge Function.
- Docker, local Studio/mail services, the Angular dev server, test PostgreSQL, and Playwright remain development tools on the owner's computer or CI runner. They are not public production services. Supabase explicitly distinguishes its [local development stack from a production deployment](https://supabase.com/Docs/Guides/Self-Hosting).

Development can continue with local Supabase and test accounts after launch. The browser-only mode is not required for that; it can remain an explicit optional mode or be removed in a later cleanup. Preserve the pure validators currently reused by shared mode when removing local persistence.

## Before provisioning

1. Confirm the implemented fixes remain green: all 140 Angular tests, 29 configuration tests, 33 database tests, and the Edge/browser checks pass. All four migrations are already applied to this project's hosted database; other environments need their own reviewed migration deployment.
2. Use the guarded `npm run build` for deployment, with explicit shared mode and a remote HTTPS API. Development commands retain local behavior. `build:local` is for local verification only; do not deploy its output or bypass validation using direct `ng build`.
3. Decide whether to start with an empty live group or import existing records. Browser-local and local Docker records are different sources. There is no supported automatic import, and the local setup helper must not be repointed at production.
4. Agree on an owner-controlled recovery email, shared password, session-revocation procedure, backups and restore test. Keep Supabase and Cloudflare administrative access separate from the shared application login; enable MFA for owner accounts.
5. Choose production and any staging origins. Avoid preview deployments writing to the live database by default; a separate staging Supabase project is safer for development smoke tests.

## Supabase preparation

Create the hosted project using owner tooling. Apply the four migrations in order, provision a single confirmed Auth user through the Auth dashboard/admin API, then create one group and its membership using that user's UUID. Do not insert into `auth.users` manually, place passwords in migration scripts, or apply `tests/support/bootstrap.sql` to a real project.

For an existing database, migration four refuses duplicate active sessions rather than ending them. This read-only query identifies affected groups:

```sql
select group_id, array_agg(id order by created_at) as active_session_ids
from public.sessions
where status = 'active'
group by group_id
having count(*) > 1;
```

Review the sessions and explicitly end the unwanted active ones through the app before retrying the migration. Do not delete them or reset the database. The new partial unique index protects distinct creation requests while preserving replay of earlier receipts.

Set hosted Auth intentionally: disable public signup and anonymous sign-in, keep email/password login enabled, allow the requested multiple concurrent sessions, set the correct site/redirect URLs, choose password protections and rate limits, and retain the agreed session-lifetime behavior. Local `config.toml` is not proof these hosted settings are already applied. See [Supabase production guidance](https://supabase.com/docs/guides/deployment/going-into-prod).

When authorized to deploy, the repository's CLI wrapper can be used from PowerShell:

```powershell
npm.cmd --prefix .\supabase ci
npm.cmd --prefix .\supabase run build:edge
npm.cmd --prefix .\supabase run cli -- login
npm.cmd --prefix .\supabase run cli -- link --project-ref YOUR_PROJECT_REF
npm.cmd --prefix .\supabase run cli -- db push --dry-run
```

Inspect the selected project and pending migrations before the write steps. For a project with existing data, arrange a backup first. The subsequent approved deployment commands are:

```powershell
npm.cmd --prefix .\supabase run cli -- db push
npm.cmd --prefix .\supabase run cli -- secrets set ALLOWED_ORIGINS=https://YOUR_APP_ORIGIN --project-ref YOUR_PROJECT_REF
npm.cmd --prefix .\supabase run cli -- functions deploy schedule --project-ref YOUR_PROJECT_REF
```

The link, dry-run, migration push, and migration-list verification were completed against this project's hosted database on 24 October 2026. All four migration versions match. Origin configuration and function deployment remain pending until the Pages origin is known. Do not run `db reset` against production. Follow [official migrations](https://supabase.com/docs/guides/local-development/database-migrations) and [Edge deployment guidance](https://supabase.com/docs/guides/functions/deploy).

The Edge bundle is generated from original domain sources and must be rebuilt separately from Angular. It reads the platform-provided URL and supported public/server key sources at runtime; Supabase documents [these environment values](https://supabase.com/docs/guides/functions/secrets). Keep service-role/secret keys out of Cloudflare's frontend variables and browser assets. Set `ALLOWED_ORIGINS` to exact approved HTTPS frontend origins. The function's `verify_jwt = false` setting retains the mandatory token verification in its handler; do not remove that handler check.

## Cloudflare Pages settings

| Setting | Proposed value |
| --- | --- |
| Repository root directory for the Pages build | `frontend` |
| Build command | `npm ci && npm run build` |
| Output directory relative to that root | `dist/padel-americano/browser` |
| Node version | Pin the tested Node 24 toolchain; the reviewed installed version is 24.22.0 |
| `PADEL_STORAGE` | `supabase` explicitly |
| `SUPABASE_URL` | Actual hosted project's HTTPS API URL, never localhost/127.0.0.1 |
| `SUPABASE_PUBLISHABLE_KEY` | That project's publishable browser key |
| `PADEL_LOGIN_EMAIL` | The provisioned shared account's owner-controlled email identifier |

These are public frontend settings. The shared password, database URL, personal access token, and service-role/secret key do not belong here. `prebuild` validates the public values in production mode, then generates `app-config.json` for Angular to copy. It rejects local mode, local/private literal addresses and known internal hostnames, HTTP, missing values, credential-bearing/path/query URLs, invalid email, and privileged key formats. It does not resolve DNS, contact the hosted API, or prove that the key belongs to that project; staging verification is still required. Review the generated artifact's mode/URL/key class without logging secret values. Do not copy a loopback development build to hosting.

Deploy only the output directory, not the repository, `.env`, `.temp`, database files, test reports, or `node_modules`. The build contains application code and public config; login does not hide those files.

Cloudflare Pages supports [SPA fallback when there is no top-level 404 page](https://developers.cloudflare.com/pages/configuration/serving-pages/). Verify direct refresh/deep links such as `/players`, `/players/<id>`, `/session/<id>`, and `/clubhouse/sessions` rather than assuming a local dev-server route proves hosted routing. No custom `_redirects` file currently exists, and one is not automatically necessary for Pages' documented SPA default.

## Headers, caching, and abuse controls

Builds now generate ignored `public/_headers`, which Angular copies to its output. Angular's production `security.autoCsp` generates the script hashes and CSP meta tag. The HTTP policy deliberately omits `script-src` and `default-src` so it does not override that script policy. It allows connections only to the app origin and the configured Supabase API. Runtime component styles require `style-src 'self' 'unsafe-inline'`; scripts do not receive that exception in modern browsers. See [Angular's CSP guidance](https://angular.dev/best-practices/security) and [Cloudflare Pages header configuration](https://developers.cloudflare.com/pages/configuration/headers/).

Generated headers deny framing and objects, disable MIME sniffing, use `Referrer-Policy: no-referrer`, restrict unused browser permissions, and request no search indexing. HTML route rules revalidate, `app-config.json` uses `no-store`, and generated JS/CSS files cache immutably. Do not add unversioned JS/CSS assets to those immutable patterns without reviewing caching. Cloudflare can join headers from overlapping rules; the current Cache-Control patterns are separate. Verify effective hosted responses and HTTPS enforcement; a local test does not prove CDN configuration.

`npm.cmd --prefix .\frontend run build:local` followed by `npm.cmd --prefix .\supabase run test:hosting` exercises the optimized build under generated headers in headless Microsoft Edge, on an isolated ephemeral local server. The test uses a browser-local fixture without backend credentials, checks lazy navigation and player creation, and confirms that an injected HTML script is blocked. It passed alongside 140 Angular tests, 29 configuration tests, lint, the optimized build, Edge type checking/bundling, and 27 Edge unit tests on 24 October. Actual hosted Auth/Edge workflows and deployed headers remain unverified.

Review Supabase Auth limits and usage alerts. No application write quota is currently implemented for the shared account. API authentication/RLS must remain enforced even when requests are made outside the browser; CORS is not an abuse-prevention substitute.

## Staging acceptance and release

- Complete the frontend, configuration (`test:config`), database, and Edge checks in [the review](LAUNCH_REVIEW.md). The corrected full frontend run is now green; keep it as a release gate.
- On the hosted staging URL, verify correct password, wrong password, no-token requests, a nonmember account, direct table-write denial, and service-only RPC denial. Use disposable staging identities, not changes to real group membership.
- Create both roster sizes, confirm scores, reload, retry an uncertain result, end/reopen, view the podium, inspect both histories and profile charts, and sort leaderboard columns on a phone. Confirm the live app points at the intended project.
- Retain the new distinct-request creation race tests, including disjoint rosters and creation replay. These cover a different race from score-confirmation concurrency tests.
- Verify real response headers, deep links, allowed/disallowed origins, persistent login, and lost-device/account recovery. No old browser-local record should unexpectedly replace a shared one.
- Test backup/export and restoration to an isolated destination. Retention and backup availability depend on the selected Supabase plan; consult [Supabase backups](https://supabase.com/docs/guides/platform/backups).
- Record the deployed commit, migration versions, function bundle, environment/project names, and rollback procedure. A frontend rollback does not automatically roll back database migrations.

Only after staging verification should the production URL be shared with the group. Document accepted limitations: one trusted account, no automatic cross-device refresh, no audited score correction, no offline operation, and calculated rankings that can change when their formula changes.
