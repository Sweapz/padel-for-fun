# padel for fun

An open-ended Americano padel app for a regular group of **5–6 players sharing one court**. Keep playing without choosing a fixed number of rounds or resetting the rotation.

## The game

- Four players play doubles while one or two rest.
- Each match has **16 combined points**; 11–5, 16–0, and 8–8 are valid results.
- Rotation prioritizes fair playing time and avoiding consecutive rests, followed by variety in partners and opponents.
- Sessions finish when the group chooses.

Navigate between Clubhouse, Session, and Players using the top bar. Choose players, see the matchup, confirm a score, and move straight to the next match. Session standings show both total points and average points per match.

Clubhouse brings together a sortable leaderboard, the latest five finished sessions, and a full session archive. Sessions rank players by result points per match (win 2, draw 1, loss 0), then average padel points. The Clubhouse leaderboard defaults to average session place, lowest first. Rankings are calculated from match history so changes to the formula can apply to earlier sessions too.

## Project status

**Development preview with local and shared modes.** Save your group on the Players page, then choose five or six of them for a session. Pick either team's score, confirm results, see the next matchup, and follow standings and match history. End a session whenever you choose and reopen its results from the home page. Click a player to browse their sessions, personal bests, averages, and a graph of their historical results.

Local mode saves records in this browser. Shared mode uses one group password and hosted Supabase so anyone in the group can run a session, using one device at a time. Existing local data stays separate. PWA installation is not implemented.

Active and finished sessions can be permanently deleted from their session page after confirmation. Deleting a session removes its matches, scores, and contribution to all statistics while keeping saved player profiles.

Built with Angular and TypeScript, with domain logic kept independent of the UI and storage.

Use the footer's Dark mode switch to change between light and dark themes. Your choice is remembered on this device.

The frontend and scheduling function are hosted, and the owner has tested the live workflow and disabled public signup. Session deletion adds a database migration and requires the updated frontend deployment. See the hosting plan for rollout status and accepted limitations.

## Documentation

- [First-release review and recommendations](docs/LAUNCH_REVIEW.md)
- [What the app and code currently do](docs/APP_OVERVIEW.md)
- [Proposed hosted deployment](docs/HOSTING_PLAN.md)
- [Install, run, and verify](docs/INSTALL_AND_RUN.md)
- [Project brief](docs/PROJECT_BRIEF.md)
- [Domain models and scoring](docs/DOMAIN.md)
- [Using the local prototype](docs/LOCAL_PROTOTYPE.md)
- [Scheduler rules, tradeoffs, and simulation results](docs/SCHEDULER.md)
- [Extended scheduler audit and before/after measurements](docs/SCHEDULER_AUDIT.md)
- [Supabase schema and shared-password design](docs/SUPABASE_PLAN.md)
- [Database setup and verification](docs/SUPABASE_SETUP.md)
- [Trusted scheduling Edge Function](docs/EDGE_SCHEDULING.md)
- [Enable shared-password mode](docs/SHARED_MODE.md)

The application source lives in `frontend/`. Contributor and agent instructions are in [AGENTS.md](AGENTS.md). 

Version 0.1.0.
