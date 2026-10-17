import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { ScoreEntry } from './score-entry';
import { Home } from '../../pages/home/home';
import { SessionSetup } from '../../pages/session-setup/session-setup';
import { BROWSER_STORAGE, SessionStore } from '../../data/session-store';
import { confirmResult, createSession } from '../../../domain/session-workflow';
import { MATCH_POINTS, PLAYERS_PER_MATCH, SUPPORTED_PLAYER_COUNTS } from '../../../domain/rules';

describe('rule-driven presentation', () => {
  it('derives every picker choice and complementary score from the points rule', async () => {
    TestBed.configureTestingModule({ imports: [ScoreEntry] });

    const fixture = TestBed.createComponent(ScoreEntry);
    await fixture.whenStable();

    const page = fixture.nativeElement as HTMLElement;
    const a = page.querySelector<HTMLButtonElement>('[data-testid="score-a"]')!;
    const b = page.querySelector<HTMLButtonElement>('[data-testid="score-b"]')!;

    expect(page.querySelector('input')).toBeNull();
    expect(page.querySelector('#score-help')).toBeNull();
    expect(page.querySelector('#score-message')).toBeNull();
    expect(page.querySelector<HTMLButtonElement>('[type="submit"]')?.disabled).toBe(true);

    for (let score = 1; score <= MATCH_POINTS; score++) {
      a.click();
      fixture.detectChanges();

      const choices = [...page.querySelectorAll<HTMLButtonElement>('[data-score]')];

      expect(choices.map((button) => Number(button.dataset['score']))).toEqual(
        Array.from({ length: MATCH_POINTS }, (_, value) => value + 1),
      );
      expect(
        page
          .querySelector<HTMLElement>('#score-picker')
          ?.style.getPropertyValue('--picker-columns'),
      ).toBe('4');

      expect(page.querySelector('[data-score="0"]')).toBeNull();

      choices[score - 1].click();
      fixture.detectChanges();

      expect(a.value).toBe(String(score));
      expect(b.value).toBe(String(MATCH_POINTS - score));
      expect(page.querySelector('#score-picker')).toBeNull();
    }

    b.click();
    fixture.detectChanges();
    page.querySelector<HTMLButtonElement>(`[data-score="${MATCH_POINTS}"]`)!.click();
    fixture.detectChanges();

    expect(a.value).toBe('0');
    expect(b.value).toBe(String(MATCH_POINTS));
    expect(page.querySelector<HTMLButtonElement>('[type="submit"]')?.disabled).toBe(false);

    a.click();
    await fixture.whenStable();

    expect(document.activeElement?.getAttribute('data-score')).toBe('1');
  });
  it('updates home-page facts from the same rule used by scoring', async () => {
    TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideRouter([]),
        { provide: BROWSER_STORAGE, useValue: () => ({ getItem: () => null }) },
      ],
    });

    const fixture = TestBed.createComponent(Home);
    await TestBed.inject(SessionStore).initialized;
    await fixture.whenStable();

    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelectorAll('.facts strong')[1].textContent).toBe(String(MATCH_POINTS));
    expect(page.querySelectorAll('.facts strong')[0].textContent).toBe(
      SUPPORTED_PLAYER_COUNTS.join('–'),
    );
  });

  it('keeps workflow error messages and accepted results consistent with the current total', () => {
    const players = Array.from({ length: SUPPORTED_PLAYER_COUNTS[0] }, (_, i) => ({
      id: String(i),
      name: `Player ${i}`,
    }));
    const now = '2026-10-17T10:00:00.000Z';
    const doc = createSession(players, 'session', 'match', now);

    expect(() => confirmResult(doc.session, 'match', { teamA: 0, teamB: 0 }, 'next', now)).toThrow(
      `total ${MATCH_POINTS}`,
    );
    expect(
      confirmResult(doc.session, 'match', { teamA: 0, teamB: MATCH_POINTS }, 'next', now).history,
    ).toHaveLength(1);
  });

  it('derives supported group options and their rest counts from shared rules', async () => {
    TestBed.configureTestingModule({
      imports: [SessionSetup],
      providers: [
        provideRouter([]),
        { provide: BROWSER_STORAGE, useValue: () => ({ getItem: () => null }) },
      ],
    });

    const fixture = TestBed.createComponent(SessionSetup);
    await TestBed.inject(SessionStore).initialized;
    await fixture.whenStable();

    const page = fixture.nativeElement as HTMLElement;
    const options = [...page.querySelectorAll('option')];

    expect(options.map((option) => Number(option.value))).toEqual([...SUPPORTED_PLAYER_COUNTS]);

    for (const option of options) {
      expect(option.textContent).toContain(`${Number(option.value) - PLAYERS_PER_MATCH}`);
    }
  });
});
