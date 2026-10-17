# Scheduler audit

The production scheduler is unchanged. The audit found no violation of the documented rest, appearance, or partnership-cost priorities. A tested additional partnership-spread tie-break did not justify changing the policy: it worsened partnership balance in one recovery scenario without improving it in any of the other sampled endpoints.

## Reproducible scope

Tests: [scheduler-audit.spec.ts](../frontend/src/domain/scheduler-audit.spec.ts). Independent enumeration, metrics, seeded fixtures, frozen baseline policy, and rejected experimental policy live in [testing/scheduler-audit.ts](../frontend/src/domain/testing/scheduler-audit.ts). These helpers have no production imports except types and the shared scoring constant; they do not use the production scheduler's enumeration or priority calculations.

- Exhaust every ordered history of length zero, one, or two, including repeated assignments and unfair histories. Also exhaust length-three histories without consecutive rests. This checks 2,401 five-player and 16,651 six-player states: **19,052 states**, evaluating all 15/45 next assignments independently.
- Generate 1,000 matches from empty history for each roster size and measure every prefix.
- For each size, generate 500 seeded histories of length `seed % 61`, seeds 1–500, and append 90 scheduled matches: **90,000 recovery matches** in total. Even seeds prohibit consecutive rests in the prefix; odd seeds allow arbitrary legal assignments. The seeded generator is an explicit 32-bit LCG, independent of platform randomness.
- Compare baseline and experiment at normal lengths 10, 15, 30, 90, and 300, plus 100 seeded recovery scenarios per size with 60 appended matches. Prefix length is `seed % 31`, with the same even/odd rule.
- Exercise roster additions, departures, replacements, unusual IDs, input-order determinism, and preservation of historical assignments.

Histories contain legal completed doubles assignments and valid scores. Scores do not affect scheduling. Exhaustiveness applies only to the short histories described above, not all possible session histories. Random recovery histories deliberately include schedules the engine would not generate itself.

## Current scheduler measurements

Ranges include every unordered pair, including unseen pairs. A consecutive-rest event counts one player resting in adjacent matches. An exact repeat counts every occurrence after the first of the same unordered pair of teams, even when separated by other matches.

| Players | Matches | Appearance range | Consecutive rests | Partner coverage; frequency | Opponent coverage; frequency | Exact repeats |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | 30 | 24–24 | 0 | 10/10; 6–6 | 10/10; 12–12 | 15 |
| 6 | 30 | 20–20 | 0 | 15/15; 4–4 | 15/15; 6–10 | 7 |
| 5 | 300 | 240–240 | 0 | 10/10; 60–60 | 10/10; 120–120 | 285 |
| 6 | 300 | 200–200 | 0 | 15/15; 40–40 | 15/15; 79–81 | 255 |
| 5 | 1,000 | 800–800 | 0 | 10/10; 200–200 | 10/10; 400–400 | 985 |
| 6 | 1,000 | 666–667 | 0 | 15/15; 133–134 | 15/15; 266–268 | 955 |

In these normal runs, appearance spread never exceeded one and partnership spread never exceeded two. Full partner coverage first occurred at matches 5 and 8 respectively, meeting the counting lower bound `ceil(C(n,2)/2)` for these runs. Full opponent coverage first occurred at matches 4 and 5. This does not establish global optimality of the subsequent schedule.

| Roster | Recovery scenarios | Inherited consecutive-rest events | Added consecutive-rest events | Worst final appearance spread | Worst final partner spread | Worst final opponent spread |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | 500 | 1,454 | 0 | 1 | 2 | 2 |
| 6 | 500 | 4,706 | 0 | 1 | 2 | 13 |

The six-player opponent spread of 13 shows a real limit: lower-priority opponent balance can remain uneven after an arbitrary history despite 90 recovery matches. It is not evidence of a rest or partnership-priority violation, nor a proof that the imbalance could not be reduced by a different policy.

## Are the imbalances avoidable?

**Consecutive rests:** none were introduced. All 19,052 short-history checks found a zero-repeat-rest next assignment. More generally, valid history has at most two previous resters; a current roster of five or six always leaves enough other players to choose the next one or two resters. Enumeration plus the first priority therefore excludes consecutive rests for these valid roster sizes. Historical repeated rests are retained rather than rewritten.

**Normal partial-session partnership imbalance:** the first spread of two occurs after match 19 for five players and match 126 for six. Exhausting all next assignments at each preceding prefix shows that every candidate with the selected rest/appearance fairness has a partnership spread of at least two. These are locally unavoidable under the existing higher priorities. Different earlier decisions might avoid them; this audit does not prove otherwise. Even spread one is arithmetically unavoidable when the total of `2 × matches` partnership encounters is not divisible by the number of pairs.

**An avoidable immediate spread difference:** six players, seed 89, prefix length 27. Current AF/BC and experimental AB/CF both rest DE, have equal appearance fairness and equal partnership-cost priorities. Projected partner spread is seven versus six, but the current choice has a better opponent-cost increment, 50 versus 52. Thus the current documented sum-of-squares partnership policy can select a worse maximum-minus-minimum spread when its partnership priorities tie. After 60 appended matches both policies have identical aggregate metrics, including partner spread one and no additional consecutive rests. Reducing this single next-match range did not demonstrate a lasting benefit.

**A late player catching up:** replace one member after 30 five-player matches. The remaining four have 24 appearances each; the newcomer has zero. After 90 further matches there are `4 × 24 + 90 × 4 = 456` appearances, so someone must have at least 92. The newcomer can have at most 90, forcing spread at least two. The scheduler reaches this bound. All four tested roster transitions/replacements reach spread at most one after 120 appended matches. No separate late-arrival reset or historical rewrite is implemented.

## Before/after experiment

The experiment inserts projected global partnership spread after the two current partnership priorities and before opponent balance. It preserves rest/appearance priorities and is retained only as a test helper. Lower spreads are better. Values below are mean endpoint spreads over the 100 recovery scenarios per roster size, after 60 appended matches.

| Players | Metric | Before/current | Experimental after |
| --- | --- | --- | --- |
| 5 | Partnership spread | 0.96 | 0.96 |
| 5 | Opponent spread | 1.35 | 1.35 |
| 5 | Appearance spread | 0.78 | 0.78 |
| 6 | Partnership spread | 0.97 | 0.98 |
| 6 | Opponent spread | 2.57 | 2.53 |
| 6 | Appearance spread | 0.65 | 0.65 |

Neither policy adds consecutive rests. Normal-session checkpoint metrics are unchanged. Among the six-player recovery endpoints, the experiment worsens partnership spread in one scenario and improves it in none. The slight average opponent improvement does not justify worsening the higher-priority partnership metric.

The worsening regression is seed 53, prefix length 22, followed by 60 matches: partner range changes from 10–11 to 10–12; partnership sum of squares rises from 1,794 to 1,798. Both policies have appearance spread one and no added repeated rests. Opponent spread stays three, while opponent sum of squares improves slightly from 7,190 to 7,184. These tradeoffs support retaining the existing scheduler. **Shipped before/after metrics are identical because the experiment was rejected.**

## Regression coverage and running the audit

Tests retain the exhaustive priority checks, long-run/recovery metrics, locally forced partial-session imbalances, immediate-spread tradeoff, worsened experimental endpoint, roster-change capacity bound, and deterministic IDs. Existing scheduler tests continue to cover invalid input and ordinary scheduling contracts. No new packages or application behavior were added.

From `frontend/`, with the project's supported Node installation available on `PATH`:

```powershell
npx.cmd --no-install vitest run src/domain/scheduler-audit.spec.ts --reporter=verbose --silent=false
npm.cmd run lint
npm.cmd test -- --watch=false
npm.cmd run build
```

The direct Vitest command prints the measured reports. The Angular test command includes the same audit in the full suite. This is extensive deterministic regression evidence, not an exhaustive search over unbounded histories or future schedules.

Validation on 2026-10-17: lint passed, all 109 tests across 13 files passed, and the production build passed. The full test run took approximately 37 seconds. Production scheduler source was unchanged.
