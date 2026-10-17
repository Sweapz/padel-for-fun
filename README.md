# Padel Americano

An open-ended Americano padel app for a regular group of **5–6 players sharing one court**. Keep playing without choosing a fixed number of rounds or resetting the rotation.

## The game

- Four players play doubles while one or two rest.
- Each match has **16 combined points**; 11–5, 16–0, and 8–8 are valid results.
- Rotation prioritizes fair playing time and avoiding consecutive rests, followed by variety in partners and opponents.
- Sessions finish when the group chooses.

The intended flow is simple: choose players, see the matchup, confirm a score, and move straight to the next match. Session standings will show both total points and average points per match.

## Project status

**Early development — local preview.** The app currently has a mobile-first layout and a session setup placeholder. Its pure TypeScript domain layer includes match/session models, score validation, and a deterministic scheduler tested over 30- and 300-match simulations for both roster sizes.

Playable sessions, score entry, standings, and saved history are next. Shared group access, authentication, PWA installation, and hosted deployment are planned for later. No data is currently saved or shared between phones.

Built with Angular and TypeScript, with domain logic kept independent of the UI and storage.

## Documentation

- [Install, run, and verify](docs/INSTALL_AND_RUN.md)
- [Project brief](docs/PROJECT_BRIEF.md)
- [Domain models and scoring](docs/DOMAIN.md)
- [Scheduler rules, tradeoffs, and simulation results](docs/SCHEDULER.md)

The application source lives in `frontend/`. Contributor and agent instructions are in [AGENTS.md](AGENTS.md).
