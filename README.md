# Padel Americano

A mobile-first Angular app foundation for a private group of 5–6 padel players sharing one court. Sessions will be open-ended, with 16 combined points per match and fair rotation based on completed match history.

## Current scope

The application lives in `frontend/`. It includes a responsive home page, lazy-loaded session setup placeholder, navigation, an unknown-route fallback, strict TypeScript and Angular template checking, and Angular's supported Vitest test builder.

This is a local development scaffold. Session creation, scheduling, scoring, statistics, persistence, authentication, Supabase, and PWA installation are not implemented. No data is saved or shared between phones.

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

## Verification

Run from `frontend/`:

```powershell
npm.cmd run lint
npm.cmd test -- --watch=false
npm.cmd run build
```

The production output is `frontend/dist/padel-americano/browser/`. Unit/integration tests run with Angular's `@angular/build:unit-test` builder and Vitest, including navigation to lazy routes and the fallback route. Browser visual/accessibility checks remain manual.

## Structure and next increments

- `frontend/src/app/app.*`: application shell, router configuration, and navigation tests.
- `frontend/src/app/pages/`: standalone route components.
- `frontend/src/styles.css`: shared mobile-first styling; no CSS framework dependency.
- `AGENTS.md` and `PROJECT_BRIEF.md`: domain rules and implementation priorities.

Next: add pure TypeScript domain types, score validation, scheduling, and statistics with simulations for both roster sizes. Keep those independent of Angular and persistence. Then add local session workflows through a storage adapter, explicitly labelled non-shared and non-production. Hosted group access, transactional result confirmation/next-match creation, and PWA support follow later.

Angular's generated runtime/build/test dependencies are retained. Angular ESLint supplies TypeScript and template linting. Commit `frontend/package-lock.json`; use `npm ci` for reproducible installs. Do not put privileged credentials in browser code.
