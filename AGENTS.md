# AGENTS.md — Padel Americano

## Mission
Project context: [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md). Design notes and implementation guides belong in `docs/`.

Build a private, mobile-first Progressive Web App for a regular group of 5–6 padel players using one court. Matches have exactly 16 combined points, e.g. 11–5. Sessions last approximately 90–120 minutes, but have **no fixed match count**. After each completed match, generate the next match without resetting the rotation. All group members should eventually be able to use the app without the project owner.

## Product priorities
1. Smooth score entry and immediate next-match display.
2. Fair rotation of rest time: no consecutive sit-outs when feasible, balanced total games played.
3. Maximize variety of partners and opponents, especially previously unseen partnerships.
4. Accurate historical records and understandable statistics.
5. Simple phone UI, accessibility, and reliable multi-user operation.

## Stack and phases
- Frontend: Angular, TypeScript, mobile-first responsive styling; PWA support when appropriate.
- Scheduling engine: pure TypeScript module with no Angular, database, or UI dependencies.
- Initial storage: in-memory or browser-local persistence for development; mark it as non-shared and non-production.
- Later: Supabase (PostgreSQL + Auth + authorization/RLS) for shared sessions; Cloudflare Pages for frontend deployment.
- Use the Angular project's supported test tooling. Prefer Vitest where compatible; do not force incompatible versions.
- Avoid a custom API server unless a concrete requirement demands one. Do not expose privileged database credentials in the browser.

## Domain rules
- A session has 5 or 6 active players in the initial scope, exactly one court, and one active match at a time.
- Every match has four distinct participants in two teams of two.
- Each completed match awards a combined 16 points. Scores are nonnegative integers; both scores must be <=16 and sum to 16. A tie of 8–8 is valid unless product requirements change.
- Entering one score should derive the other as 16 minus that score; users may edit either score.
- Sessions are open-ended; do not ask for or require a predetermined number of rounds.
- Save completed matches with stable identifiers, sequence numbers, participants, teams, scores, and timestamps.
- Never mutate historical matches to improve a future schedule. Explicit corrections must be auditable and must not silently reshuffle already announced matches.
- A published next match is stable unless a user explicitly requests regeneration or an administrative override.
- If participants join or leave, recompute future scheduling using history; handle unsupported roster sizes explicitly rather than silently producing invalid matches.

## Scheduler requirements
- Generate the next match from the completed match history and current roster.
- Hard constraints: four distinct active players, two valid teams, and no invalid or duplicated match assignments.
- Prioritize balanced appearances and avoiding consecutive rests whenever mathematically feasible. For 5 players, one rests per match; for 6 players, two rest per match. A feasible 6-player rest rotation exists with no consecutive rests.
- Among viable lineups, prefer fewer repeated partnerships, then more balanced opponent encounters. Do not confuse 'playing against' with 'partnering with'.
- Evaluate all unique legal matchups for 5–6 players (15 for 5; 45 for 6), or use a documented deterministic look-ahead method. Exclude team-side swaps as duplicate matchups.
- Use deterministic tie-breaking (stable player IDs or an explicitly stored random seed), so tests are reproducible.
- Document tradeoffs: rest fairness and perfect partnership coverage may conflict in short partial sessions.
- Do not claim that a heuristic guarantees globally optimal coverage unless proven or tested exhaustively.
- Expose explainable metadata for why a matchup was selected (rest counts, partner counts, opponent counts) when useful.

## Ranking and statistics
- Track points earned, matches played, points per match, wins/losses/ties if useful, rest counts, partner frequency, and opponent frequency.
- Show both total points and average points per match. For unequal match counts, do not silently present total points as an intrinsically fair ranking; label the chosen leaderboard rule clearly.
- Derive aggregates from completed matches first; avoid premature denormalized totals.

## UI workflow
1. Create session and choose players.
2. Generate and publish a match, including two teams and resting players.
3. Enter or adjust scores with live total validation.
4. Confirm result explicitly.
5. Persist completion and generate/publish exactly one next match.
6. Show next matchup and updated standings; allow ending the session at any time.
- Handle duplicate submissions and loading/error states.
- Use clear touch targets, keyboard accessibility, and readable contrast.

## Architecture and code quality
- Separate domain types, scheduling, statistics, persistence, and UI components.
- Keep scheduling and scoring logic in pure functions; avoid side effects and global mutable state.
- Use strict TypeScript types; validate external inputs at runtime.
- Prefer small components and services with clear responsibilities.
- Ensure reusable code where possible and always consider if code can be used elsewhere.
- Do not introduce dependencies without explaining their purpose.
- Store configuration in environment variables; never commit secrets or service-role keys.
- For Supabase, enable and test Row Level Security on user-facing tables; only authorized group members can access group data.
- Treat multi-user score confirmation and next-match creation as an atomic/idempotent operation (e.g. transactional RPC), not two unrelated browser writes.

## Testing expectations
- Add tests alongside each scheduler change. Cover 5-player and 6-player sessions, long sessions, repeated match generation, no duplicate players, correct rest counts, no consecutive rests where feasible, pairing diversity, and deterministic results.
- Validate scores: 0–16, 8–8, 16–0, invalid totals, negative numbers, fractions, blanks, and duplicate submission.
- Add tests for correcting scores, ending sessions, and resumed sessions when implemented.
- Prefer property-based or exhaustive simulations where practical; report metrics rather than asserting unproven guarantees.
- Run lint, tests, and build after meaningful changes; state commands and outcomes.

## Codex working agreement
- Before a major change, inspect the repository and briefly outline the plan.
- Work in small, reviewable increments; do not scaffold the whole production backend in the first pass.
- Explain important architecture choices and assumptions.
- Update README and relevant tests when behavior changes.
- Do not delete or overwrite user work without asking.
- If requirements are ambiguous, choose a reversible default, document it, and ask when the choice would materially affect behavior.
- After each task, summarize changed files, tests run, and suggested next step.
