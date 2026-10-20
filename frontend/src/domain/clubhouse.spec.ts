import { describe, expect, it } from 'vitest';
import { clubhouseStandings, previousSessions } from './clubhouse';
import { confirmResult, createSession, endSession, type SessionDocument } from './session-workflow';

const players = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: id.toUpperCase() }));

function finished(id: string, day: number, score = 12): SessionDocument {
  const now = `2026-10-${String(day).padStart(2, '0')}T12:00:00Z`;
  const doc = createSession(players, id, `${id}-match`, now);
  const scored = confirmResult(
    doc.session,
    doc.session.activeMatch!.id,
    { teamA: score, teamB: 16 - score },
    `${id}-next`,
    now,
  );

  return { players, session: endSession(scored, now) };
}

describe('Clubhouse summaries', () => {
  it('orders only finished sessions by completion date without changing storage order', () => {
    const older = finished('older', 1);
    const newer = finished('newer', 3);
    const active = createSession(players, 'active', 'active-match', '2026-10-04T12:00:00Z');
    const documents = [older, active, newer];

    expect(previousSessions(documents).map((doc) => doc.session.id)).toEqual(['newer', 'older']);
    expect(documents).toEqual([older, active, newer]);
  });

  it('aggregates by stable player ID, excludes active sessions and uses current names', () => {
    const first = finished('first', 1, 12);
    const second = finished('second', 2, 8);
    const live = createSession(players, 'live', 'live-match', '2026-10-03T12:00:00Z');
    const active = {
      ...live,
      session: confirmResult(
        live.session,
        'live-match',
        { teamA: 16, teamB: 0 },
        'live-next',
        '2026-10-03T12:01:00Z',
      ),
    };
    const updated = players.map((player) => ({ ...player, name: `New ${player.name}` }));

    const rows = clubhouseStandings(updated, [first, second, active]);
    const teamA = first.session.history[0].teamA;
    const teamB = first.session.history[0].teamB;

    for (const id of teamA) {
      expect(rows.find((row) => row.player.id === id)).toMatchObject({
        points: 20,
        played: 2,
        average: 10,
        averageSessionRank: 1,
        sessions: 2,
        sessionWins: 2,
        player: { name: `New ${id.toUpperCase()}` },
      });
    }

    for (const id of teamB) {
      expect(rows.find((row) => row.player.id === id)).toMatchObject({
        points: 12,
        played: 2,
        average: 6,
        averageSessionRank: 2,
        sessions: 2,
        sessionWins: 1,
      });
    }

    expect(rows).toHaveLength(4);
    expect(rows[0].average).toBe(10);
  });

  it('retains archived historical players and omits players without completed appearances', () => {
    const doc = finished('first', 1);
    const rows = clubhouseStandings([], [doc]);

    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.played === 1)).toBe(true);
    expect(clubhouseStandings(players, [])).toEqual([]);
  });

  it('recalculates earlier places with a changed policy without mutating saved results', () => {
    const doc = finished('history', 1);
    const original = JSON.stringify(doc);
    const id = doc.session.history[0].teamA[0];

    const before = clubhouseStandings(players, [doc]);
    const after = clubhouseStandings(players, [doc], { win: 0, draw: 1, loss: 2 });

    expect(before.find((row) => row.player.id === id)).toMatchObject({
      averageSessionRank: 1,
      sessionWins: 1,
    });
    expect(after.find((row) => row.player.id === id)).toMatchObject({
      averageSessionRank: 3,
      sessionWins: 0,
    });
    expect(JSON.stringify(doc)).toBe(original);
  });

  it('weights session places equally even when sessions have different match counts', () => {
    const short = finished('short', 1, 12);
    const long = finished('long', 2, 4);
    const repeated = {
      ...long,
      session: {
        ...long.session,
        history: Array.from({ length: 10 }, (_, index) => ({
          ...long.session.history[0],
          id: `long-${index}`,
          sequence: index + 1,
        })),
      },
    };
    const empty = createSession(players, 'empty', 'unplayed', '2026-10-03T12:00:00Z');
    const endedEmpty = { ...empty, session: endSession(empty.session, '2026-10-03T13:00:00Z') };

    const rows = clubhouseStandings(players, [short, repeated, endedEmpty]);

    expect(rows).toHaveLength(4);
    expect(
      rows.every(
        (row) => row.averageSessionRank === 2 && row.sessions === 2 && row.sessionWins === 1,
      ),
    ).toBe(true);
    expect(rows.map((row) => row.player.name)).toEqual(
      [...rows.map((row) => row.player.name)].sort(),
    );
    expect(clubhouseStandings(players, [endedEmpty])).toEqual([]);
  });
});
