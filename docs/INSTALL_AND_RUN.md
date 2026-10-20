# Install and run

[Project overview](../README.md)

## Windows / VS Code setup

Verified toolchain: Node **24.22.0 LTS**, npm **11.19.1**, Angular/CLI **22.2.3**, TypeScript **6.0.3**, and Vitest **5.0.5**. Dependencies are local to the frontend; no global Angular CLI is required.

In a PowerShell terminal:

```powershell
Set-Location 'C:\Users\Nille\Documents\Coding\padel-for-fun'
nvm use 24.22.0
node --version
npm --version
Set-Location .\frontend
npm.cmd ci
npm.cmd start
```

Open http://localhost:4200/. Stop the server with Ctrl+C. If NVM is not installed, install Node 24 LTS and omit `nvm use`. If activation is not reflected in VS Code, reopen the terminal. `.cmd` commands avoid PowerShell script execution policy issues.

For browser-local mode, use a modern browser with localStorage and Web Locks enabled. Local saving requires localhost or HTTPS and the same browser profile/origin (including port) to reopen its library. An HTTP LAN address may not provide Web Locks. Shared mode uses Supabase instead of Web Locks for record writes; it still uses browser storage for remembered login and retry identifiers. See [shared setup](SHARED_MODE.md) for Docker, account, and Edge serving commands. Starting Angular alone does not provide a hosted backend for the group.

See [Using the local prototype](LOCAL_PROTOTYPE.md) for the session workflow, error recovery, and storage behavior.

## Verification

Run from `frontend/`:

```powershell
npm.cmd run lint
npm.cmd test -- --watch=false
npm.cmd run build
```

The production output is `frontend/dist/padel-americano/browser/`. Unit/integration tests run with Angular's `@angular/build:unit-test` builder and Vitest, including navigation to lazy routes and the fallback route. Domain tests exhaust all 289 integer score pairs from 0–16, derive scores from all 17 valid values on either side, and reject invalid runtime values. A Playwright mobile workflow is available through `npm.cmd --prefix .\supabase run test:browser` from the repository root, with the local stack, served Edge Function, built frontend, and Microsoft Edge installed. Complete visual/accessibility verification still needs manual device checks.

Session tests cover five/six-player creation, complementary score edits, explicit confirmation, duplicate submissions, saved-match stability on reload, standings, end/cancel behavior, storage failures, malformed saved data, and stale-tab updates. UI integration tests use Angular and jsdom; they are not real-browser end-to-end or visual tests.

## Dependencies

Angular's generated runtime/build/test dependencies are retained. Angular ESLint supplies TypeScript and template linting. Commit `frontend/package-lock.json`; use `npm ci` for reproducible installs. Do not put privileged credentials in browser code.

Supabase SDK 2.118.0 provides shared-password authentication and authorized database/Edge requests. The default remains local mode until configured. See [Enable shared mode](SHARED_MODE.md) for private local account setup and the required serving commands. Database and browser-testing tools are isolated in `supabase/`; see [Database setup and verification](SUPABASE_SETUP.md).

Before hosting, consult [the launch review](LAUNCH_REVIEW.md) and [hosting plan](HOSTING_PLAN.md). The 2026-10-20 full suite has one known outdated header-selector assertion (139 other tests passed); do not treat the current release gate as green until it is fixed. Building without an explicit shared-mode setting currently produces local mode; the development artifact may also contain a loopback API URL. Neither should be published as the shared release.

