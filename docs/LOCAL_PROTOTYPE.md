# Using the local prototype

[Project overview](../README.md) · [Install and run](INSTALL_AND_RUN.md)

This guide describes **local mode**. For password-protected group storage, see [Shared mode](SHARED_MODE.md). Switching modes does not import, merge, or delete the local library.

## Play a session

1. Open the **Players** tab and add your group once, using distinct names. Choose the **Session** tab, select the group size, and check five or six saved players. No match count is required. Existing profiles are reused rather than creating new identities for each session.
2. Create the session. The first match shows Team A, Team B, and resting players.
3. Tap either team's score to open a picker with four numbers per row, from one to the shared points total (currently a 4×4 grid). Zero is not a picker choice; selecting the full points total for one team still derives zero for the other. Select a number to update both teams and close the picker; the other score is derived automatically. No typing is required. Close without changing a score using Escape, clicking outside, or moving focus outside the score entry. Arrow keys and Home/End navigate the number choices. Scores remain unconfirmed until you press the confirmation button.
4. Press **Confirm result & next match**. The confirmed record and exactly one next match are saved together. The score fields reset for the new match, and focus moves to its heading.
5. Switch between **Current match**, **Scoreboard**, and **History** using the session tabs. A score draft stays intact while switching tabs. Scoreboard includes standings and partner/opponent encounters, ordered by average points per match, then name; total points are shown separately. Arrow keys and Home/End navigate between tabs with a keyboard.
6. Choose **End session**, then confirm or keep playing. Ending preserves completed results and discards the unconfirmed current match. You can end before completing any matches.

The home page lists all sessions saved in this browser. Resume an active session or view an ended session's results. The prototype allows one active session at a time; end it before starting another. Ended sessions are retained when a new session starts. Reopening results does not reopen an ended session for play.

Use the top navigation tabs to switch between **Clubhouse**, **Session**, and **Players**. The selected section stays highlighted, including session and player detail pages. Active sessions initially show Current match; ending a session or reopening ended results shows Scoreboard.

## Local storage and recovery

This is local-only development storage, not a shared or production service. Player profiles and session snapshots are stored together under `padel-americano.sessions.v1` in localStorage. Data belongs to the current browser profile and origin, not an account. Other devices do not receive it. Clearing browser data removes it, and private browsing may remove it on exit. Score drafts are not saved; reload restores confirmed results and the published match.

The adapter validates the versioned library on load. Invalid or unsupported saved data is left untouched, an error is shown, and writes are blocked. If browser storage was temporarily unavailable, enable it and choose **Retry loading**. Invalid saved data needs inspection/recovery through browser tools; the UI does not silently reset or delete it.

If a save fails (for example, quota or storage access failure), the session remains at its last saved state and the current score draft remains available for retry. Loading/saving states are announced, and actions are disabled while saving. Successful writes publish the new in-memory state only after storage accepts it.

Each result and its next match are serialized in one localStorage replacement. Match IDs guard confirmation: an identical retry does not append another result or advance another round; different scores for an already completed match are rejected. Saving requires Web Locks on localhost or HTTPS. A lock coordinates this app's same-origin tabs, and a raw-value comparison prevents a stale tab from overwriting newer saved data. External storage events refresh the library and announce the change. If another tab saves first, review the refreshed session before retrying.

These measures coordinate this prototype's browser tabs; they are not multi-user database transactions. Shared sessions will require authenticated access and an atomic/idempotent server-side operation.

## Implementation boundaries

- `src/domain/session-workflow.ts`: pure session transitions using the existing scheduler and score validation.
- `src/domain/statistics.ts`: pure aggregates derived from completed history.
- `src/domain/local-session-format.ts`: runtime format validation; restores announced matches without regenerating them.
- `src/app/data/session-store.ts`: browser persistence and loading/write/error state.
- `src/app/pages/`: home library, session creation, and live/ended session pages. Each page has its own folder with matching `.ts`, `.html`, and `.css` files; the shared workflow integration test remains at the pages level.
- `src/app/components/`: score entry, standings, and reusable storage feedback, each in its own folder with separate class, template, and component CSS. For example: `components/score-entry/score-entry.ts`, `score-entry.html`, and `score-entry.css`.
- `src/app/app.*`: root component class, external template, stylesheet, and tests.
- `src/styles.css`: shared tokens, typography, form/control defaults, and utility classes. Component layouts and responsive rules live with their owning components.

Paths above are relative to `frontend/`. No new dependencies were added. Authentication, Supabase, roster changes, manual regeneration, audited score corrections, export, and installable/offline PWA behavior are outside this increment.



## Player profiles and session counts

Players are added on the Players page with a stable ID and a trimmed name. New names must be distinct (ignoring letter case) and at most the shared `PLAYER_NAME_MAX_LENGTH` characters. Session setup selects saved IDs and requires exactly the chosen group size. The session keeps a name snapshot for historical display and reuses each profile ID in its teams and results.

Sessions played counts each session once if the player participated in at least one completed match, including an active session. An empty session or a session in which they only rested does not count. Counts are derived from history, not persisted as totals. Player profiles also link to session history and historical statistics, described below. Renaming, merging, and deleting profiles are not implemented.

The local envelope is now version 2, holding both `players` and `sessions`. The existing storage key is retained for compatibility. Version 1 sessions load by importing their player IDs; no historical records or published matches are changed. The next successful write persists version 2. Old sessions previously created a fresh ID for every name entry: matching names across those sessions are kept as separate imported profiles, not automatically merged. Duplicate imported names are labelled with their IDs for distinction. New sessions reuse whichever saved profiles you choose. Changing browsers still does not transfer these profiles.

## Individual player pages

Click a player in the Players list to open their profile. The Sessions tab lists their active and ended sessions, most recent first, with direct links to each session. It includes sessions where they were selected but have not completed a match; those sessions do not contribute to played-session counts or averages.

Historical data shows:

- Average points per session: total earned points divided by sessions with at least one completed appearance.
- Average points per match: total earned points divided by completed appearances (weighted across sessions, not an average of session averages).
- Most points in one session: the largest per-session total earned by this player.
- Most points in one match: the largest team score earned by this player in one completed match.

The line chart defaults to average points per match for each session, with a point marking each session. Switch its selector to total points per session to compare session totals. Points-per-match averages help compare sessions of different lengths; totals depend on appearances. Sessions are ordered oldest to newest with equal spacing, not by elapsed time. Active sessions are included using only completed matches, so their values may still change. The data table identifies sessions in progress. The chart itself is not clickable. Use the session links in the data table below it to open individual sessions.

No completed appearances produces an empty graph and dashes for averages/records. Genuine zero scores are shown as zero. Graph data is also available in an expandable table. Profile tabs support arrow keys and Home/End. All calculations remain browser-local and use stable player IDs; same-name imported profiles remain separate.
