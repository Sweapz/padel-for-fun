import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { SessionStore } from '../../data/session-store';
import { confirmResult, createSession, endSession } from '../../../domain/session-workflow';

describe('Clubhouse tabs and session archive', () => {
  const players = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: id.toUpperCase() }));

  beforeEach(() => {
    const finished = Array.from({ length: 7 }, (_, index) => {
      const now = `2026-10-${String(index + 1).padStart(2, '0')}T12:00:00Z`;
      const doc = createSession(players, `session-${index}`, `match-${index}`, now);
      const scored = confirmResult(
        doc.session,
        `match-${index}`,
        { teamA: 12, teamB: 4 },
        `next-${index}`,
        now,
      );

      return { players, session: endSession(scored, now) };
    });
    const active = createSession(players, 'active', 'active-match', '2026-10-10T12:00:00Z');

    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        {
          provide: SessionStore,
          useValue: {
            players: signal(players),
            sessions: signal([finished[2], active, ...finished.filter((_, i) => i !== 2)]),
            ready: signal(true),
            error: signal(''),
            notice: signal(''),
          },
        },
      ],
    });
  });

  it('shows the latest five finished sessions and opens the complete archive', async () => {
    const harness = await RouterTestingHarness.create('/');
    const page = harness.routeNativeElement!;
    const previous = page.querySelector<HTMLButtonElement>('#club-tab-previous')!;

    expect(page.querySelector<HTMLElement>('#club-panel-leaderboard')!.hidden).toBe(false);
    expect(page.querySelector('.active-sessions a')?.getAttribute('href')).toBe('/session/active');

    previous.click();
    harness.detectChanges();

    const links = [...page.querySelectorAll('#club-panel-previous .session-list a')];

    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/session/session-6',
      '/session/session-5',
      '/session/session-4',
      '/session/session-3',
      '/session/session-2',
    ]);
    expect(page.querySelector<HTMLElement>('#club-panel-leaderboard')!.hidden).toBe(true);

    page.querySelector<HTMLAnchorElement>('#club-panel-previous header a')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/clubhouse/sessions');
    expect(harness.routeNativeElement!.querySelectorAll('.session-list a')).toHaveLength(7);
    expect(harness.routeNativeElement!.textContent).not.toContain('Resume session');
  });

  it('supports keyboard tab switching and retains the leaderboard values', async () => {
    const harness = await RouterTestingHarness.create('/');
    const page = harness.routeNativeElement!;
    const leaderboard = page.querySelector<HTMLButtonElement>('#club-tab-leaderboard')!;

    leaderboard.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    harness.detectChanges();

    expect(page.querySelector('#club-tab-previous')?.getAttribute('aria-selected')).toBe('true');
    expect(leaderboard.tabIndex).toBe(-1);

    const previous = page.querySelector<HTMLButtonElement>('#club-tab-previous')!;
    previous.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }),
    );
    harness.detectChanges();

    expect(leaderboard.getAttribute('aria-selected')).toBe('true');
    expect(page.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(page.querySelector('tbody tr')?.textContent).toContain('84');
  });
});
