import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from '../../app';
import { routes } from '../../app.routes';
import { BROWSER_STORAGE, SessionStore } from '../../data/session-store';
import { createSession, confirmResult, endSession } from '../../../domain/session-workflow';
import { serializeLocalLibrary } from '../../../domain/local-session-format';

const players = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` }));
const date = '2026-10-17T10:00:00.000Z';

function document(id: string, score: number) {
  const doc = createSession(players, id, `${id}-m1`, date);
  const played = confirmResult(
    doc.session,
    `${id}-m1`,
    { teamA: score, teamB: 16 - score },
    `${id}-m2`,
    date,
  );

  return { ...doc, session: endSession(played, date) };
}

describe('player profiles', () => {
  const first = document('s1', 8);
  const second = document('s2', 12);
  const playerId = first.session.history[0].teamA[0];

  beforeEach(() => {
    const raw = serializeLocalLibrary({
      players: [...players, { id: 'unused', name: 'New player' }],
      sessions: [second, first],
    });

    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        { provide: BROWSER_STORAGE, useValue: () => ({ getItem: () => raw }) },
      ],
    });
  });

  async function open(url: string) {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(SessionStore).initialized;
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
    fixture.detectChanges();

    return { fixture, page: fixture.nativeElement as HTMLElement };
  }

  it('opens a player from the list, removes the session CTA, and links their sessions', async () => {
    const { fixture, page } = await open('/players');

    expect(page.textContent).not.toContain('Choose players for a session');

    page.querySelector<HTMLAnchorElement>(`[data-profile-id="${playerId}"] a`)!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(TestBed.inject(Router).url).toBe(`/players/${playerId}`);
    expect(page.querySelector('h1')?.textContent).toBe(
      players.find((p) => p.id === playerId)!.name,
    );
    expect(page.querySelectorAll('.player-sessions li')).toHaveLength(2);

    page.querySelector<HTMLAnchorElement>('.player-sessions a')!.click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toMatch(/^\/session\/s[12]$/);
  });

  it('shows historical metrics and a line chart with session links in its data table', async () => {
    const { fixture, page } = await open(`/players/${playerId}`);
    const tab = page.querySelector<HTMLButtonElement>('#player-tab-statistics')!;

    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.querySelector<HTMLElement>('#player-panel-sessions')?.hidden).toBe(true);
    expect(page.querySelector<HTMLElement>('#player-panel-statistics')?.hidden).toBe(false);
    expect(page.querySelectorAll('.personal-records dd')[0].textContent?.trim()).toBe('10.0');
    expect(page.querySelectorAll('.chart .point')).toHaveLength(2);
    expect(page.querySelector('.chart polyline')).not.toBeNull();
    expect(page.querySelector('.chart a')).toBeNull();
    expect(page.querySelector('figcaption')?.textContent).toContain('Average points per match');

    const metric = page.querySelector<HTMLSelectElement>('#trend-metric')!;
    metric.value = 'points';
    metric.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(page.querySelector('figcaption')?.textContent).toContain('Total points per session');
    expect(page.querySelectorAll('tbody tr')).toHaveLength(2);

    page.querySelector<HTMLAnchorElement>('tbody a')!.click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toMatch(/^\/session\/s[12]$/);
  });

  it('handles unknown players and players without any sessions', async () => {
    const { fixture, page } = await open('/players/unused');

    expect(page.textContent).toContain('No sessions yet');
    page.querySelector<HTMLButtonElement>('#player-tab-statistics')!.click();
    fixture.detectChanges();

    expect(page.textContent).toContain('No completed matches yet');
    expect(page.querySelectorAll('.personal-records dd')[0].textContent?.trim()).toBe('—');

    await TestBed.inject(Router).navigateByUrl('/players/missing');
    await fixture.whenStable();

    expect(page.querySelector('h1')?.textContent).toBe('Player not found');
  });
});
