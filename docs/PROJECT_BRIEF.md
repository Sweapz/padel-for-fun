# Padel Americano — Project Brief

## Problem
Our private group plays Americano padel approximately 90–120 minutes per session. Usually 5 or 6 players share one court. Existing apps require a fixed number of rounds; when we continue beyond the generated schedule, resetting can cause some people to sit out two or three matches in a row. We want an open-ended session that adapts as we play and keeps long-term statistics.

## Rules and goals
- Four players play doubles on one court; the other 1–2 players rest.
- Each match has **16 total points** (examples: 9–7, 12–4, 8–8).
- Matchups should rotate partners and opponents as evenly as possible. Diversity is more important than skill-balanced matches.
- Fair playing time and avoiding consecutive sit-outs are important.
- We don't know how many matches we will play; the session ends manually.
- Any authorized group member should eventually be able to start sessions, submit scores, and view statistics.

## Core user journey
Create session -> select players -> generate first match -> show teams and resting players -> enter score (other team's score auto-calculated) -> confirm -> save result -> update stats -> generate next match -> repeat -> end session.

## MVP
- Manage player names and create 5/6-player sessions.
- Open-ended next-match generation using session history.
- 16-point score entry with validation and confirmation.
- Current matchup, resting players, match history, session standings.
- A testable pure TypeScript scheduling engine.
- Local-only development mode (not shared across phones).

## Later milestones
- Supabase persistence and authentication; group-scoped access and RLS.
- Multi-user real-time updates, safe concurrent score submission.
- Historical statistics, partnership/opponent matrices, trends, seasons.
- PWA installation, deployment, optional offline read/entry strategy.
- Late arrivals and departures, explicit overrides, score corrections and audit trail.

## Technical proposal
Angular + TypeScript frontend, responsive UI (Tailwind optional), pure TypeScript scheduler, Supabase PostgreSQL/Auth later, Cloudflare Pages deployment. Start with a local functional prototype before adding hosted infrastructure.

## Important engineering choices
- Save individual match records, not only cumulative player scores.
- Separate scheduling, scoring, statistics, and persistence.
- Generate and publish only one next match at a time; a future preview can be tentative.
- Do not silently rewrite announced matchups after a historical score edit.
- Keep a deterministic scheduler and run simulations for both 5 and 6 players.
- Ranking should show points per match as well as total points because players may have different numbers of appearances.

## Open questions (do not block initial development)
- Should 8–8 be considered a draw? Default: yes.
- Do we rank session winners by average points per match or total points? Display both until agreed.
- Do players authenticate individually or share a group invite? Decide before hosted launch.
- Should there be a manual scheduling override? Later feature.
