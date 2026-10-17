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

## Verification

Run from `frontend/`:

```powershell
npm.cmd run lint
npm.cmd test -- --watch=false
npm.cmd run build
```

The production output is `frontend/dist/padel-americano/browser/`. Unit/integration tests run with Angular's `@angular/build:unit-test` builder and Vitest, including navigation to lazy routes and the fallback route. Domain tests exhaust all 289 integer score pairs from 0–16, derive scores from all 17 valid values on either side, and reject invalid runtime values. Browser visual/accessibility checks remain manual.

## Dependencies

Angular's generated runtime/build/test dependencies are retained. Angular ESLint supplies TypeScript and template linting. Commit `frontend/package-lock.json`; use `npm ci` for reproducible installs. Do not put privileged credentials in browser code.

