# Padel Americano — Project Brief

Current implementation: **padel for fun**, reviewed on 20 October 2026. The prototype has progressed through local Supabase, shared-password login, trusted scheduling, historical player statistics, calculated rankings, and the Clubhouse/session UI. Hosted deployment is the next phase, subject to [the launch findings](LAUNCH_REVIEW.md). Use [the app overview](APP_OVERVIEW.md) for what is built today; the brief retains the product goals below.

## Problem
Our private group plays Americano padel approximately 90–120 minutes per session. Usually 5 or 6 players share one court. Existing apps require a fixed number of rounds; when we continue beyond the generated schedule, resetting can cause some people to sit out two or three matches in a row. We want an open-ended session that adapts as we play and keeps long-term statistics.

## Rules and goals
- Four players play doubles on one court; the other 1–2 players rest.
- Each match has **16 total points** (examples: 9–7, 12–4, 8–8).
- Matchups should rotate partners and opponents as evenly as possible. Diversity is more important than skill-balanced matches.
- Fair playing time and avoiding consecutive sit-outs are important.
- We don't know how many matches we will play; the session ends manually.
- Group members use one shared password; each phone has its own remembered Auth session. Players are records, not personal authentication accounts. The intended session workflow uses one device at a time.

## Core user journey
Create session -> select players -> generate first match -> show teams and resting players -> enter score (other team's score auto-calculated) -> confirm -> save result -> update stats -> generate next match -> repeat -> end session.

## MVP
- Manage player names and create 5/6-player sessions.
- Open-ended next-match generation using session history.
- 16-point score entry with validation and confirmation.
- Current matchup, resting players, match history, session standings.
- A testable pure TypeScript scheduling engine.
- Supabase persistence, password-only shared login, group-scoped RLS, and atomic score/next-match confirmation, implemented and tested locally.
- Reusable players, player histories/line charts, sortable Clubhouse rankings, a finished-session podium, and full session archive.
- Optional local-only development mode remains in the repository. It is not the intended hosted storage mode.

## Later milestones
- Hosted provisioning/deployment, security headers, backups/recovery, and release checks.
- Audited score corrections, player edit/archive UI, and optional later seasons.
- PWA installation and any explicit offline strategy, if needed.
- Late arrivals and departures, explicit overrides, score corrections and audit trail.

Safe concurrent score confirmation is implemented. Automatic cross-device updates were deliberately removed; an already-open second device needs a reload. Partnership/opponent encounters and historical player trends are already available.

## Technical proposal
Angular + TypeScript frontend with component CSS, a pure TypeScript scheduler, Supabase PostgreSQL/Auth and an Edge scheduling adapter. Cloudflare Pages is the proposed frontend host. Docker and the local Supabase stack support development/testing, not public production hosting.

## Important engineering choices
- Save individual match records, not only cumulative player scores.
- Separate scheduling, scoring, statistics, and persistence.
- Generate and publish only one next match at a time; a future preview can be tentative.
- Do not silently rewrite announced matchups after a historical score edit.
- Keep a deterministic scheduler and run simulations for both 5 and 6 players.
- Ranking should show points per match as well as total points because players may have different numbers of appearances.

## Agreed choices and remaining decisions

- 8–8 is a draw.
- Session places use result points per match (win 2, draw 1, loss 0), then average padel points. Exact ties share competition places and session wins.
- Clubhouse defaults to average finishing place across finished sessions, lowest first. Each played session has equal weight. All rankings are calculated from recorded matches rather than saved as fixed totals or winner flags.
- Authentication uses one shared Supabase Auth account, with no personal accounts or Sign out control. This has documented trust/recovery consequences.
- Hosting still needs a domain/project choice, real environment configuration, headers, recovery/backups, and a decision about existing development data. See [the hosting plan](HOSTING_PLAN.md).
- Manual scheduling overrides, roster changes, and audited score corrections remain later features.
