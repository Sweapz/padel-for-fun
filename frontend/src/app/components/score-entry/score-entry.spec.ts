import { TestBed } from '@angular/core/testing';
import { ScoreEntry } from './score-entry';
import { MATCH_POINTS } from '../../../domain/scoring';

describe('score picker interaction', () => {
  it('supports keyboard navigation, Escape, focus restoration, and outside dismissal', async () => {
    TestBed.configureTestingModule({ imports: [ScoreEntry] });

    const fixture = TestBed.createComponent(ScoreEntry);
    await fixture.whenStable();

    const page = fixture.nativeElement as HTMLElement;
    const trigger = page.querySelector<HTMLButtonElement>('[data-testid="score-a"]')!;
    const press = async (key: string) => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      await fixture.whenStable();
      fixture.detectChanges();
    };

    trigger.click();
    await fixture.whenStable();

    expect(document.activeElement?.getAttribute('data-score')).toBe('1');

    await press('ArrowDown');
    expect(document.activeElement?.getAttribute('data-score')).toBe('5');

    await press('End');
    expect(document.activeElement?.getAttribute('data-score')).toBe(String(MATCH_POINTS));

    await press('Home');
    expect(document.activeElement?.getAttribute('data-score')).toBe('1');

    await press('Escape');
    expect(page.querySelector('#score-picker')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.value).toBe('');

    trigger.click();
    await fixture.whenStable();
    document.body.click();
    await fixture.whenStable();

    expect(page.querySelector('#score-picker')).toBeNull();
    expect(trigger.value).toBe('');
  });

  it('confirms only on explicit submit and blocks changes while saving', async () => {
    TestBed.configureTestingModule({ imports: [ScoreEntry] });

    const fixture = TestBed.createComponent(ScoreEntry);
    const results: unknown[] = [];
    fixture.componentInstance.confirmed.subscribe((result) => results.push(result));
    await fixture.whenStable();

    const page = fixture.nativeElement as HTMLElement;
    const trigger = page.querySelector<HTMLButtonElement>('[data-testid="score-a"]')!;

    trigger.click();
    await fixture.whenStable();
    page.querySelector<HTMLButtonElement>('[data-score="8"]')!.click();
    await fixture.whenStable();

    expect(results).toEqual([]);

    page.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(results).toEqual([{ teamA: 8, teamB: MATCH_POINTS - 8 }]);

    fixture.componentRef.setInput('busy', true);
    await fixture.whenStable();
    fixture.componentInstance.openPicker('teamA');
    page.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));

    expect(fixture.componentInstance.picker()).toBeNull();
    expect(results).toHaveLength(1);
    expect(trigger.value).toBe('8');
    expect(page.querySelector('fieldset')?.disabled).toBe(true);
  });
});
