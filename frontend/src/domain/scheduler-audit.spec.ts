import { describe, expect, it } from 'vitest';
import { scheduleNextMatch } from './scheduler';
import {
  assignmentKey,
  completed,
  compareVectors,
  evaluateAssignments,
  legalAssignments,
  originalPolicy,
  spreadTiePolicy,
  metrics,
  simulate,
  randomHistory,
} from './testing/scheduler-audit';
import type { CompletedMatch } from './models';

describe.each([5, 6])('scheduler audit: %i players', (size) => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, size);

  it('exhausts all histories through length two and all no-repeat-rest histories of length three', () => {
    const candidates = legalAssignments(ids);
    let states = 0,
      worseSpreadTies = 0;
    let minPartnerSpread = Infinity,
      maxPartnerSpread = 0;

    const check = (history: readonly CompletedMatch[]) => {
      const selectedMatch = scheduleNextMatch(ids, history);
      const evaluated = evaluateAssignments(ids, history);
      const selected = evaluated.find(
        (candidate) => candidate.key === assignmentKey(selectedMatch),
      )!;
      const sorted = [...evaluated].sort((a, b) =>
        compareVectors([...a.fairness, ...a.partnership], [...b.fairness, ...b.partnership]),
      );

      expect(selected).toBeDefined();
      expect(selected.fairness[0]).toBe(0);
      expect([...selected.fairness, ...selected.partnership]).toEqual([
        ...sorted[0].fairness,
        ...sorted[0].partnership,
      ]);
      expect(assignmentKey(selectedMatch)).toBe(assignmentKey(originalPolicy(ids, history)));

      const equivalent = evaluated.filter(
        (candidate) =>
          compareVectors(
            [...candidate.fairness, ...candidate.partnership],
            [...selected.fairness, ...selected.partnership],
          ) === 0,
      );
      const bestSpread = Math.min(...equivalent.map((candidate) => candidate.partnerSpread));

      if (selected.partnerSpread > bestSpread) worseSpreadTies++;

      minPartnerSpread = Math.min(minPartnerSpread, selected.partnerSpread);
      maxPartnerSpread = Math.max(maxPartnerSpread, selected.partnerSpread);
      states++;
    };

    check([]);

    for (const first of candidates) {
      const one = [completed(first, 1)];
      check(one);

      for (const second of candidates) {
        const two = [...one, completed(second, 2)];
        check(two);

        if (second.restingPlayerIds.some((id) => first.restingPlayerIds.includes(id))) continue;

        for (const third of candidates) {
          if (third.restingPlayerIds.some((id) => second.restingPlayerIds.includes(id))) continue;

          check([...two, completed(third, 3)]);
        }
      }
    }

    console.info(
      JSON.stringify({
        size,
        exhaustiveStates: states,
        restViolations: 0,
        fairnessOrPartnerCostViolations: 0,
        worseSpreadTies,
        minPartnerSpread,
        maxPartnerSpread,
      }),
    );
    expect(states).toBe(size === 5 ? 2401 : 16651);
  }, 120000);

  it('measures long runs, normal partial sessions, and recovery from varied histories', () => {
    const long = simulate(scheduleNextMatch, ids, 1000);
    let maxPrefixAppearances = 0,
      maxPrefixPartnerSpread = 0;
    let firstUnbalancedPrefix: unknown = null;
    let partnerCoverageAt = 0,
      opponentCoverageAt = 0;
    const possiblePairs = (size * (size - 1)) / 2;

    for (let length = 1; length <= long.length; length++) {
      const report = metrics(ids, long.slice(0, length));
      maxPrefixAppearances = Math.max(maxPrefixAppearances, report.appearanceSpread);
      maxPrefixPartnerSpread = Math.max(maxPrefixPartnerSpread, report.partners.spread);

      if (!partnerCoverageAt && report.partners.covered === possiblePairs)
        partnerCoverageAt = length;
      if (!opponentCoverageAt && report.opponents.covered === possiblePairs)
        opponentCoverageAt = length;

      if (!firstUnbalancedPrefix && report.partners.spread > 1) {
        const previous = long.slice(0, length - 1);
        const choices = evaluateAssignments(ids, previous);
        const selected = choices.find(
          (candidate) => candidate.key === assignmentKey(long[length - 1]),
        )!;
        const sameFairness = choices.filter(
          (candidate) => compareVectors(candidate.fairness, selected.fairness) === 0,
        );
        firstUnbalancedPrefix = {
          length,
          partnerSpread: report.partners.spread,
          minimumSpreadWithSameFairness: Math.min(
            ...sameFairness.map((candidate) => candidate.partnerSpread),
          ),
          assignment: selected.key,
        };
      }
    }

    expect(metrics(ids, long).consecutiveRests).toBe(0);
    expect(maxPrefixAppearances).toBe(1);
    expect(maxPrefixPartnerSpread).toBeLessThanOrEqual(2);
    expect(partnerCoverageAt).toBe(size === 5 ? 5 : 8);

    let inheritedRestEvents = 0,
      addedRestEvents = 0,
      maxFinalAppearanceSpread = 0;
    let maxFinalPartnerSpread = 0,
      maxFinalOpponentSpread = 0;

    for (let seed = 1; seed <= 500; seed++) {
      const prefix = randomHistory(ids, seed % 61, seed, seed % 2 === 0);
      const inherited = metrics(ids, prefix);
      const history = simulate(scheduleNextMatch, ids, prefix.length + 90, prefix);
      const final = metrics(ids, history);

      inheritedRestEvents += inherited.consecutiveRests;
      addedRestEvents += final.consecutiveRests - inherited.consecutiveRests;
      maxFinalAppearanceSpread = Math.max(maxFinalAppearanceSpread, final.appearanceSpread);
      maxFinalPartnerSpread = Math.max(maxFinalPartnerSpread, final.partners.spread);
      maxFinalOpponentSpread = Math.max(maxFinalOpponentSpread, final.opponents.spread);

      expect(final.consecutiveRests - inherited.consecutiveRests).toBe(0);
    }

    console.info(
      JSON.stringify({
        size,
        long: metrics(ids, long),
        maxPrefixAppearances,
        maxPrefixPartnerSpread,
        partnerCoverageAt,
        opponentCoverageAt,
        firstUnbalancedPrefix,
        recoveries: {
          runs: 500,
          appendedMatches: 45000,
          inheritedRestEvents,
          addedRestEvents,
          maxFinalAppearanceSpread,
          maxFinalPartnerSpread,
          maxFinalOpponentSpread,
        },
      }),
    );
    expect(addedRestEvents).toBe(0);
    expect(maxFinalAppearanceSpread).toBeLessThanOrEqual(1);
  }, 120000);

  it('compares baseline and spread tie-break on reproducible simulations', () => {
    for (const length of [10, 15, 30, 90, 300]) {
      const before = metrics(ids, simulate(originalPolicy, ids, length));
      const experiment = metrics(ids, simulate(spreadTiePolicy, ids, length));

      console.info(JSON.stringify({ size, length, before, experiment }));
    }

    const summaries = [];
    const baselineReports = new Map<number, ReturnType<typeof metrics>>();

    for (const next of [originalPolicy, spreadTiePolicy]) {
      let restErrors = 0,
        partnerSpread = 0,
        opponentSpread = 0,
        appearanceSpread = 0;
      let referenceDifferences = 0;
      let worsePartnerChoices = 0;
      let witness: unknown = null;
      let worsePartnerEndpoints = 0,
        betterPartnerEndpoints = 0;
      let endpointWitness: unknown = null;

      for (let seed = 1; seed <= 100; seed++) {
        const prefix = randomHistory(ids, seed % 31, seed, seed % 2 === 0);
        const current = scheduleNextMatch(ids, prefix);

        if (assignmentKey(current) !== assignmentKey(originalPolicy(ids, prefix)))
          referenceDifferences++;

        const candidates = evaluateAssignments(ids, prefix);
        const selected = candidates.find((candidate) => candidate.key === assignmentKey(current))!;
        const alternate = candidates.find(
          (candidate) =>
            JSON.stringify(candidate.fairness) === JSON.stringify(selected.fairness) &&
            JSON.stringify(candidate.partnership) === JSON.stringify(selected.partnership) &&
            candidate.partnerSpread < selected.partnerSpread,
        );

        if (alternate) {
          worsePartnerChoices++;
          witness ??= {
            seed,
            prefixLength: prefix.length,
            selected: selected.key,
            alternate: alternate.key,
            spreadBefore: selected.partnerSpread,
            spreadAlternative: alternate.partnerSpread,
          };
        }

        const history = simulate(next, ids, prefix.length + 60, prefix);
        const report = metrics(ids, history);
        if (next === originalPolicy) {
          baselineReports.set(seed, report);
        } else {
          const baseline = baselineReports.get(seed)!;

          if (report.partners.spread > baseline.partners.spread) {
            worsePartnerEndpoints++;
            endpointWitness ??= { seed, before: baseline, experiment: report };
          }
          if (report.partners.spread < baseline.partners.spread) betterPartnerEndpoints++;
        }
        const inherited = metrics(
          ids,
          prefix.length ? prefix : history.slice(0, 1),
        ).consecutiveRests;
        restErrors += report.consecutiveRests - inherited;
        partnerSpread += report.partners.spread;
        opponentSpread += report.opponents.spread;
        appearanceSpread += report.appearanceSpread;
      }

      summaries.push({
        policy: next === originalPolicy ? 'before' : 'experiment',
        restErrors,
        meanPartnerSpread: partnerSpread / 100,
        meanOpponentSpread: opponentSpread / 100,
        meanAppearanceSpread: appearanceSpread / 100,
        referenceDifferences,
        worsePartnerChoices,
        witness,
        worsePartnerEndpoints,
        betterPartnerEndpoints,
        endpointWitness,
      });
      expect(restErrors).toBe(0);
      expect(referenceDifferences).toBe(0);
    }

    console.info(JSON.stringify({ size, summaries }));
  }, 120000);

  it('records normal partial-session imbalances as locally unavoidable under rest/appearance fairness', () => {
    const length = size === 5 ? 19 : 126;
    const history = simulate(scheduleNextMatch, ids, length - 1);
    const choices = evaluateAssignments(ids, history);
    const next = scheduleNextMatch(ids, history);
    const selected = choices.find((candidate) => candidate.key === assignmentKey(next))!;
    const fairChoices = choices.filter(
      (candidate) => compareVectors(candidate.fairness, selected.fairness) === 0,
    );

    expect(selected.fairness[0]).toBe(0);
    expect(selected.partnerSpread).toBe(2);
    expect(Math.min(...fairChoices.map((candidate) => candidate.partnerSpread))).toBe(2);
    expect(history).toHaveLength(length - 1);
  });

  it('handles roster changes and unusual deterministic IDs without adding repeated rests', () => {
    const scenarios = [
      { before: ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, size === 5 ? 6 : 5), after: ids },
      { before: ids, after: [...ids.slice(0, -1), 'new-player'] },
    ];

    for (const scenario of scenarios) {
      const prefix = simulate(scheduleNextMatch, scenario.before, 30);
      const original = structuredClone(prefix);
      const final = simulate(scheduleNextMatch, scenario.after, 120, prefix);

      expect(metrics(scenario.after, final).consecutiveRests).toBe(0);
      const prior = metrics(scenario.after, prefix).appearances;
      const total = prior.reduce((sum, n) => sum + n, 0) + 90 * 4;
      const minimumPlayerCapacity = Math.min(...prior) + 90;
      const spreadLowerBound = Math.max(
        total % scenario.after.length ? 1 : 0,
        Math.ceil(total / scenario.after.length) - minimumPlayerCapacity,
      );

      expect(metrics(scenario.after, final).appearanceSpread).toBe(spreadLowerBound);
      expect(final.slice(0, 30)).toEqual(original);
      console.info(
        JSON.stringify({
          size,
          transition: `${scenario.before.length} to ${scenario.after.length}`,
          replacement: scenario.after.includes('new-player'),
          after90: metrics(scenario.after, final),
          spreadLowerBound,
        }),
      );

      const recovered = simulate(scheduleNextMatch, scenario.after, 150, final);
      expect(metrics(scenario.after, recovered).appearanceSpread).toBeLessThanOrEqual(1);
    }

    const idSets = [
      ['a|b', 'a', 'b|c', 'c', '__proto__', '"'].slice(0, size),
      ['ø', 'Z', '0', '雪', 'a', '\\'].slice(0, size),
      Array.from({ length: size }, (_, i) => `player-${100 - i}`),
    ];

    for (const roster of idSets) {
      const final = simulate(scheduleNextMatch, roster, 90);
      expect(metrics(roster, final).consecutiveRests).toBe(0);
      expect(metrics(roster, final).appearanceSpread).toBe(0);
      expect(metrics(roster, final).partners.covered).toBe((size * (size - 1)) / 2);
      expect(scheduleNextMatch([...roster].reverse(), final)).toEqual(
        scheduleNextMatch(roster, final),
      );
    }
  }, 120000);
});

describe('documented recovery tradeoff regression', () => {
  it('retains the baseline when the spread tie-break worsens later partnership balance', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const prefix = randomHistory(ids, 22, 53, false);
    const inheritedRests = metrics(ids, prefix).consecutiveRests;

    const before = metrics(ids, simulate(originalPolicy, ids, 82, prefix));
    const experiment = metrics(ids, simulate(spreadTiePolicy, ids, 82, prefix));

    expect(before.partners.spread).toBe(1);
    expect(experiment.partners.spread).toBe(2);
    expect(before.partners.squares).toBe(1794);
    expect(experiment.partners.squares).toBe(1798);
    expect(before.consecutiveRests).toBe(inheritedRests);
    expect(experiment.consecutiveRests).toBe(inheritedRests);
    expect(metrics(ids, simulate(scheduleNextMatch, ids, 82, prefix))).toEqual(before);
  });

  it('reproduces the avoidable immediate spread difference without treating it as global improvement', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const prefix = randomHistory(ids, 27, 89, false);
    const current = scheduleNextMatch(ids, prefix);
    const experiment = spreadTiePolicy(ids, prefix);
    const candidates = evaluateAssignments(ids, prefix);
    const before = candidates.find((candidate) => candidate.key === assignmentKey(current))!;
    const alternative = candidates.find(
      (candidate) => candidate.key === assignmentKey(experiment),
    )!;

    expect(before.fairness).toEqual(alternative.fairness);
    expect(before.partnership).toEqual(alternative.partnership);
    expect(before.partnerSpread).toBe(7);
    expect(alternative.partnerSpread).toBe(6);
    expect(before.opposition).toBeLessThan(alternative.opposition);

    const beforeRecovery = metrics(ids, simulate(originalPolicy, ids, 87, prefix));
    const afterRecovery = metrics(ids, simulate(spreadTiePolicy, ids, 87, prefix));
    console.info(
      JSON.stringify({ regression: 'seed-89', before, alternative, beforeRecovery, afterRecovery }),
    );
    expect(afterRecovery).toEqual(beforeRecovery);
    expect(beforeRecovery.consecutiveRests).toBe(metrics(ids, prefix).consecutiveRests);
  });
});
