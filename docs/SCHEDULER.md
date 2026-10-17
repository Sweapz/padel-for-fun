# Next-match scheduler

Implementation: [scheduler.ts](../frontend/src/domain/scheduler.ts). Tests: [scheduler.spec.ts](../frontend/src/domain/scheduler.spec.ts).

`scheduleNextMatch(playerIds, history)` is a pure, deterministic, one-step heuristic. It returns `teamA`, `teamB` (two IDs each), `restingPlayerIds`, and explanation metadata. It creates no IDs, timestamps, results, or persisted records. There are no Angular or storage dependencies.

```typescript
const next = scheduleNextMatch(['a', 'b', 'c', 'd', 'e'], completedMatches);
// Caller publishes this assignment once and retains it until explicitly replaced.
```

## Inputs and boundaries

Pass five or six distinct nonblank string IDs and the ordered completed history of a single session. Unsupported/invalid rosters throw `RangeError`; malformed history throws `TypeError`. History validation checks two players per team, distinct players across teams and rests, one or two resters, completed status, valid 16-point results, unique match IDs, one session ID, and strictly increasing positive safe-integer sequences. Sequence gaps are permitted. Timestamps are not consumed or validated by the scheduler. This is not a general serialized-session parser.

Previously active players may appear in history even if absent from the current roster. All historical encounters are retained; appearance fairness compares only currently active IDs. A new player starts with zero appearances. Rest counts come from each historical match's recorded rest list, so time absent is not counted as rest. Consecutive-rest detection uses only the last completed match's recorded resters. A roster change can cause short-term appearance imbalance; no late-arrival fairness policy beyond cumulative appearances is implemented.

Inputs are never sorted or changed in place. Scores do not affect scheduling beyond requiring valid completed records. Repeated calls with the same inputs return equal values, and changing roster input order does not change the result. There is no hidden rotation state to reset after a reload.

## Enumeration and ranking

Sort a copy of the roster by JavaScript string comparison (`<` / `>`, UTF-16 code-unit order, independent of locale). Enumerate each four-player subset and its three distinct partitions into teams: `C(5,4) × 3 = 15` or `C(6,4) × 3 = 45`. Team-side and within-team swaps are not extra candidates. Every candidate contains four distinct active players and the complementary resting IDs.

Minimize this vector lexicographically (earlier entries always take precedence):

1. Number of resters who also rested in the preceding match.
2. Spread of projected total appearances (maximum minus minimum).
3. Sum of squared projected appearances, further favoring underplayed players.
4. Number of candidate partnerships that have occurred before, prioritizing unseen partnerships.
5. Increase in the sum of squared partnership frequencies: `Σ(2c + 1)` for the two candidate partner pairs.
6. Increase in the sum of squared opponent frequencies: `Σ(2c + 1)` for the four cross-team pairs.
7. Number of previous occurrences of the exact team pairing.

The squared-frequency increments are equivalent to comparing the full resulting sums of squares because historical totals are constant across candidates. Partnership counts and opponent counts are separate, unordered player-pair maps. Each match contributes two partner encounters and four opponent encounters.

The final tie-break compares canonical JSON matchup keys with the same locale-independent string comparison. Each team is sorted by player ID, the two team arrays are sorted by their JSON strings, and the result is JSON-encoded. JSON avoids collisions for IDs containing delimiters or quotes. Lower keys win. Identical assignments have identical keys; exact-match repetition is permitted across time, as required for open-ended sessions.

Explanation metadata includes the evaluated candidate count, selected priority vector, current players' appearance/rest counts before selection, the two partner counts in team A/B order, and the four opponent counts in nested team A then team B order. These explain selection without affecting it.

Because all assignments are enumerated and consecutive rest is first, a no-consecutive-rest candidate wins whenever one exists, even if another candidate would improve appearances more. Under valid five/six-player history there are at most two previous resters, leaving enough players to select the next rest group without overlap. This local constraint says nothing about globally optimal future partnership coverage.

## Measured simulations

Starting from empty history with IDs `a` through `e` or `f`, every generated result is recorded as 8–8. Scores are otherwise irrelevant. Metrics are independently collected in `scheduler.spec.ts`, rather than taken from scheduler explanations.

| Players | Matches | Appearances per player | Rests per player | Consecutive rest events | Partner coverage (frequency range) | Opponent coverage (frequency range) | Unique exact matchups | Repeated exact occurrences |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 5 | 30 | 24 each | 6 each | 0 | 10/10 (6–6) | 10/10 (12–12) | 15 | 15 |
| 6 | 30 | 20 each | 10 each | 0 | 15/15 (4–4) | 15/15 (6–10) | 23 | 7 |
| 5 | 300 | 240 each | 60 each | 0 | 10/10 (60–60) | 10/10 (120–120) | 15 | 285 |
| 6 | 300 | 200 each | 100 each | 0 | 15/15 (40–40) | 15/15 (79–81) | 45 | 255 |

Coverage counts unordered player pairs encountered at least once, out of `C(n,2)`. Frequency ranges include zero for unseen pairs. Consecutive rest events count individual players resting in adjacent matches. Repeated exact occurrences count each match after that exact unordered team pairing was first seen; they are not just immediate rematches.

The tests also verify appearance spread at most one at every simulated prefix, rest/participant validity throughout, deterministic resumed generation, input immutability, invalid input rejection, roster changes, and 12-match continuations from each of the 15/45 possible initial matchups. Those are measured regression expectations for these scenarios, not proofs for every history or possible ID ordering.

Run the full suite through Angular from `frontend/`:

```powershell
npm.cmd test -- --watch=false
```

For visible simulation metrics, run the pure domain spec directly with the installed Vitest version (no additional packages):

```powershell
npx.cmd --no-install vitest run src/domain/scheduler.spec.ts --reporter=verbose --silent=false
```

## Tradeoffs and limits

Rest fairness and appearance balance can defer unseen partnerships in short partial sessions. The six-player 30-match sample has perfectly balanced partnerships but less balanced opponent counts, and repeats seven exact matchups before covering all 45. Exact-match novelty is deliberately lower priority than those fairness/diversity goals. No global optimality or shortest coverage horizon is claimed; there is no future-match look-ahead.

Runtime is linear in history plus scoring/sorting at most 45 candidates; rebuilding history-derived counts on each call keeps the API stateless. Published-match stability, ending/resuming session workflows, transactional duplicate submission handling, and audited corrections are caller responsibilities. A correction must not silently replace an already published match.
