import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ClubhouseStanding } from '../../../domain/clubhouse';
import { ClubhouseLeaderboard } from './clubhouse-leaderboard';

describe('Sortable Clubhouse leaderboard', () => {
  const rows: readonly ClubhouseStanding[] = [
    {
      player: { id: 'b', name: 'Bo' },
      averageSessionRank: 1.5,
      sessions: 2,
      sessionWins: 1,
      resultAverage: 1.5,
      average: 9,
      points: 90,
      played: 10,
      wins: 7,
      ties: 1,
      losses: 2,
    },
    {
      player: { id: 'a', name: 'Anna' },
      averageSessionRank: 3,
      sessions: 4,
      sessionWins: 2,
      resultAverage: 1,
      average: 8,
      points: 160,
      played: 20,
      wins: 8,
      ties: 4,
      losses: 8,
    },
  ];

  async function setup() {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ClubhouseLeaderboard);
    fixture.componentRef.setInput('rows', rows);
    await fixture.whenStable();

    return fixture;
  }

  it('defaults to average session place and toggles numeric sorting in both directions', async () => {
    const fixture = await setup();
    const page = fixture.nativeElement as HTMLElement;
    const firstName = () => page.querySelector('tbody th')!.textContent!.trim();

    expect(firstName()).toBe('Bo');
    expect(page.querySelector('th[aria-sort="ascending"]')?.textContent).toContain('Avg place');

    const points = page.querySelector<HTMLButtonElement>('[aria-label="Sort by Points"]')!;
    points.click();
    fixture.detectChanges();

    expect(firstName()).toBe('Anna');
    expect(page.querySelector('th[aria-sort="descending"]')?.textContent).toContain('Points');

    points.click();
    fixture.detectChanges();

    expect(firstName()).toBe('Bo');
    expect(rows[0].player.name).toBe('Bo');
  });

  it('makes every column sortable and supports alphabetical player sorting', async () => {
    const fixture = await setup();
    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelectorAll('thead button')).toHaveLength(
      fixture.componentInstance.columns.length + 1,
    );

    for (const button of page.querySelectorAll<HTMLButtonElement>('thead button')) {
      button.click();
      fixture.detectChanges();

      expect(page.querySelectorAll('th[aria-sort]')).toHaveLength(1);
      expect(button.closest('th')?.hasAttribute('aria-sort')).toBe(true);
    }

    page.querySelector<HTMLButtonElement>('[aria-label="Sort by player"]')!.click();
    fixture.detectChanges();

    expect(page.querySelector('tbody th')?.textContent?.trim()).toBe('Anna');
  });
});
