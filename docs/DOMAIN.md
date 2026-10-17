# Domain guide

[Project overview](../README.md)

## Domain models and scores

`frontend/src/domain/` has no Angular, UI, storage, or other runtime dependencies:

- `rules.ts`: the current shared game format (`MATCH_POINTS`, supported roster sizes, players per team/match, and court count). Scoring, roster validation, and rule-dependent UI text/limits use these values. `scoring.ts` retains its `MATCH_POINTS` re-export. Derived hints and examples update with the rules; odd point totals do not advertise a draw.
- `models.ts`: readonly `Player`, `Session`, `Match`, `Team`, and `MatchResult` types. A team is a pair of stable player IDs; a roster has five or six IDs. Match records retain team/rest assignments, sequence, publication time, and confirmed scores/time when completed. Sessions keep completed history separately from at most one published match and have no fixed match count.
- `scoring.ts`: `isValidScore(value)`, `validateScores(teamA, teamB)`, and `deriveScores(changedTeam, score)`. Each accepts unknown score values and rejects strings (including numeric strings), blanks, null, non-finite numbers, fractions, and values outside 0–16. Valid pairs must total 16; 8–8 is valid.
- `scheduler.ts`: `scheduleNextMatch(playerIds, completedHistory)` enumerates all 15/45 unique legal matchups, prioritizing avoiding consecutive rests and balanced appearances before partner/opponent variety. It returns teams, resting IDs, and explainable selection metadata. See [scheduler rules and measured simulations](SCHEDULER.md) for input validation, tie-breaking, metrics from 30/300-match sessions, and heuristic limits.

```typescript
validateScores(8, 8);        // { valid: true, scores: { teamA: 8, teamB: 8 } }
deriveScores('teamA', 11);   // { valid: true, scores: { teamA: 11, teamB: 5 } }
deriveScores('teamB', 6);    // { valid: true, scores: { teamA: 10, teamB: 6 } }
validateScores(8, 7);        // { valid: false, error: { code: 'invalid-total' } }
deriveScores('teamB', '');   // { valid: false, error: { code: 'invalid-score', team: 'teamB' } }
```

The helpers return fresh values without mutation, coercion, clamping, or exceptions for invalid scores. An invalid-score error identifies the edited/invalid side; validation checks team A first if both are invalid. Convert UI text explicitly before calling, while preserving blanks as invalid. IDs and UTC ISO timestamps are supplied by callers, keeping the domain deterministic.

The models are compile-time contracts, not runtime parsers. Readonly types prevent ordinary TypeScript assignment but do not deep-freeze runtime objects. Use the score validator before constructing a result; scheduling and browser-storage boundaries validate their consumed inputs.

## Session workflow and statistics

These constants describe the current format; they are not per-session settings. Changing the points total does not migrate existing saved results, which are validated against the current scoring rules. Review/migrate saved data before changing deployed rules. Changing roster/team sizes also requires reviewing fixed-size types and the four-player matchup enumeration algorithm, not just editing a constant.

- `session-workflow.ts`: pure creation, result confirmation, and ending. Callers supply stable IDs and timestamps. Creation publishes the first match; confirmation adds a completed record and generates one next match from full history. A retry of the same match/result is a no-op; conflicting scores or a stale match ID are rejected. Ending retains completed history and drops the unconfirmed current match. Ended sessions cannot accept new results.
- `statistics.ts`: derives points, appearances, average points per match, wins/losses/draws, recorded rest counts, and separate partner/opponent encounter maps. Standings sort by average descending, then name and ID; players without appearances have a null average and sort last. No aggregates are persisted.
- `players.ts`: validates new reusable profiles and derives sessions played by stable player ID. A session counts once after at least one completed appearance; being selected or resting alone does not count.
- `local-session-format.ts`: pure runtime parsing/serialization of the versioned local prototype library. It validates fixed five/six-player rosters, distinct names/IDs, court count, timestamps, sequential match records, result scores, teams/rests, status, and at most one active session. Version 2 holds a player catalog and session snapshots, and checks that every session references catalog IDs. Version 1 loads by importing profiles by ID, without merging matching names or rewriting history. It retains the stored published assignment without invoking the scheduler. This format intentionally does not support roster edits yet.

The Angular `SessionStore` in `frontend/src/app/data/` owns browser access, UUID/time generation, loading/error state, and coordinated writes. See [the prototype guide](LOCAL_PROTOTYPE.md) for storage guarantees and limitations. Audited score corrections and reopening ended sessions for further play are not implemented.


