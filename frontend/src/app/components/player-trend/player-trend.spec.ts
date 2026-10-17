import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PlayerTrend } from './player-trend';
import type { PlayerSessionSummary } from '../../../domain/player-history';

function session(id: string, points: number, played: number): PlayerSessionSummary {
  return {
    sessionId: id,
    createdAt: '2026-10-17T10:00:00.000Z',
    status: 'ended',
    playerNames: ['Anna'],
    points,
    played,
    average: played ? points / played : null,
    bestGame: played ? 0 : null,
  };
}

describe('player trend line chart', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({ imports: [PlayerTrend], providers: [provideRouter([])] }),
  );

  it('updates line positions and axes when switching from averages to totals', async () => {
    const fixture = TestBed.createComponent(PlayerTrend);
    fixture.componentRef.setInput('sessions', [session('a', 32, 4), session('b', 16, 1)]);
    await fixture.whenStable();

    const page = fixture.nativeElement as HTMLElement;
    const points = () =>
      [...page.querySelectorAll<HTMLElement>('.point')].map((point) => point.style.bottom);
    const line = page.querySelector('polyline')!;
    const before = line.getAttribute('points');

    expect(points()).toEqual(['50%', '100%']);
    expect(page.querySelector('.chart a, .chart button')).toBeNull();
    expect(page.querySelectorAll('.y-axis span')).toHaveLength(5);

    const select = page.querySelector<HTMLSelectElement>('select')!;
    select.value = 'points';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(points()).toEqual(['100%', '50%']);
    expect(line.getAttribute('points')).not.toBe(before);
    expect(page.querySelector('figcaption')?.textContent).toContain('Total points');
    expect(page.querySelectorAll('tbody a')).toHaveLength(2);
  });

  it('centers a single zero-score point and handles an empty series without invalid coordinates', async () => {
    const fixture = TestBed.createComponent(PlayerTrend);
    fixture.componentRef.setInput('sessions', [session('a', 0, 1)]);
    await fixture.whenStable();

    const page = fixture.nativeElement as HTMLElement;
    const point = page.querySelector<HTMLElement>('.point')!;

    expect(point.style.left).toBe('50%');
    expect(point.style.bottom).toBe('0%');
    expect(page.querySelector('polyline')?.getAttribute('points')).toBe('50,100');

    fixture.componentInstance.metric.set('points');
    fixture.detectChanges();

    expect(page.querySelector('polyline')?.getAttribute('points')).toBe('50,100');

    fixture.componentRef.setInput('sessions', []);
    await fixture.whenStable();

    expect(page.querySelector('svg')).toBeNull();
    expect(page.textContent).toContain('No completed matches yet');
  });
});
