# padel for fun

An open-ended Americano padel app for a regular group of **5–6 players sharing one court**. Keep playing without choosing a fixed number of rounds or resetting the rotation.

## The game

- Four players play doubles while one or two rest.
- Each match has **16 combined points**; 11–5, 16–0, and 8–8 are valid results.
- Rotation prioritizes fair playing time and avoiding consecutive rests, followed by variety in partners and opponents.
- Sessions finish when the group chooses.

Navigate between Clubhouse, Session, and Players using the top bar. Choose players, see the matchup, confirm a score, and move straight to the next match. Session standings show both total points and average points per match.

## Project status

**Development preview with local and shared modes.** Save your group on the Players page, then choose five or six of them for a session. Pick either team's score, confirm results, see the next matchup, and follow standings and match history. End a session whenever you choose and reopen its results from the home page. Click a player to browse their sessions, personal bests, averages, and a graph of their historical results.

Local mode saves records in this browser. Shared mode uses one group password and Supabase so anyone in the group can run a session, using one device at a time. Existing local data stays separate. PWA installation and hosted deployment are planned for later.

Built with Angular and TypeScript, with domain logic kept independent of the UI and storage.

## Documentation

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
