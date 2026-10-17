# Domain guide

[Project overview](../README.md)

## Domain models and scores

`frontend/src/domain/` has no Angular, UI, storage, or other runtime dependencies:

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

The models are compile-time contracts, not runtime parsers: they do not enforce distinct IDs, active membership, valid timestamps, positive sequence numbers, or score totals by themselves. Use the score validator before constructing a result; future session/scheduling boundaries must enforce the remaining invariants. Readonly types prevent ordinary TypeScript assignment but do not deep-freeze runtime objects. Ending sessions, recording results, duplicate-submission handling, and audited corrections remain future workflows.


