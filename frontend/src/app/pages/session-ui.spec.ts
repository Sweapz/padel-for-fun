import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from '../app';
import { routes } from '../app.routes';
import { BROWSER_STORAGE, SESSION_LOCK, SessionStore } from '../data/session-store';
import { serializeLocalLibrary } from '../../domain/local-session-format';

describe('local session user workflow', () => {
  let raw: string | null;
  let failSave: boolean;
  let fixture: ComponentFixture<App>;
  let page: HTMLElement;

  const input = (selector: string, value: string) => {
    if (selector.includes('data-testid="score-')) {
      page.querySelector<HTMLButtonElement>(selector)!.click();
      fixture.detectChanges();
      page.querySelector<HTMLButtonElement>(`[data-score="${value}"]`)!.click();
      fixture.detectChanges();
      return;
    }

    const element = page.querySelector<HTMLInputElement>(selector)!;

    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  };

  const submit = () =>
    page
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

  const button = (text: string) =>
    [...page.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes(text),
    )!;

  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    raw = serializeLocalLibrary({
      players: Array.from({ length: 6 }, (_, i) => ({
        id: `player-${i}`,
        name: `Player ${i + 1}`,
      })),
      sessions: [],
    });
    failSave = false;

    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        {
          provide: BROWSER_STORAGE,
          useValue: () => ({
            getItem: () => raw,
            setItem: (_key: string, value: string) => {
              if (failSave) throw new Error('Quota exceeded');

              raw = value;
            },
          }),
        },
        { provide: SESSION_LOCK, useValue: async (task: () => Promise<unknown>) => task() },
      ],
    });

    fixture = TestBed.createComponent(App);
    page = fixture.nativeElement as HTMLElement;

    await TestBed.inject(SessionStore).initialized;
    await TestBed.inject(Router).navigateByUrl('/session/new');
    await settle();
  });

  async function fillNames(size: number) {
    const select = page.querySelector<HTMLSelectElement>('select')!;

    select.value = String(size);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    for (let i = 0; i < size; i++) {
      const checkbox = page.querySelector<HTMLInputElement>(`[data-player-id="player-${i}"]`)!;

      if (!checkbox.checked) checkbox.click();

      fixture.detectChanges();
    }

    submit();
    await settle();
  }

  it.each([5, 6])(
    'creates %i-player sessions, scores either side, confirms once, resumes, and ends',
    async (size) => {
      await fillNames(size);

      const store = TestBed.inject(SessionStore);
      const doc = store.sessions()[0];

      expect(doc.players).toHaveLength(size);
      expect(page.querySelector('#match-title')?.textContent).toContain('Match 1');
      expect(page.textContent).not.toContain('Local-only prototype');
      expect(page.textContent).not.toContain('Shared group preview');
      expect(button('Confirm result').disabled).toBe(true);

      input('[data-testid="score-a"]', '11');

      expect(page.querySelector<HTMLInputElement>('[data-testid="score-b"]')?.value).toBe('5');

      input('[data-testid="score-b"]', '6');

      expect(page.querySelector<HTMLInputElement>('[data-testid="score-a"]')?.value).toBe('10');

      submit();
      submit();
      await settle();

      expect(store.sessions()[0].session.history).toHaveLength(1);
      expect(page.querySelector('#match-title')?.textContent).toContain('Match 2');
      expect(page.querySelector<HTMLInputElement>('[data-testid="score-a"]')?.value).toBe('');
      expect(page.querySelectorAll('.history-list li')).toHaveLength(1);
      expect(page.querySelector('table')?.textContent).toContain('Points');

      const announced = store.sessions()[0].session.activeMatch;

      store.load();
      await settle();

      expect(store.sessions()[0].session.activeMatch).toEqual(announced);

      input('[data-testid="score-a"]', '8');
      submit();
      await settle();

      expect(store.sessions()[0].session.history).toHaveLength(2);

      input('[data-testid="score-a"]', '16');
      submit();
      await settle();

      expect(store.sessions()[0].session.history.at(-1)?.result.scores).toEqual({
        teamA: 16,
        teamB: 0,
      });

      button('End session').click();
      await settle();

      button('Keep playing').click();
      await settle();

      expect(store.sessions()[0].session.status).toBe('active');

      button('End session').click();
      await settle();

      button('End session now').click();
      await settle();

      expect(page.querySelector('h1')?.textContent).toContain('Good games');
      expect(page.querySelector('app-score-entry')).toBeNull();
      expect(store.sessions()[0].session.history).toHaveLength(3);

      await TestBed.inject(Router).navigateByUrl('/');
      await settle();

      expect(page.textContent).toContain('View results');

      page.querySelector<HTMLButtonElement>('#club-tab-previous')!.click();
      await settle();

      page.querySelector<HTMLAnchorElement>('.session-list a')!.click();
      await settle();

      expect(page.querySelectorAll('.history-list li')).toHaveLength(3);
    },
  );

  it('requires a full player selection and a score selection before confirmation', async () => {
    expect(button('Create session').disabled).toBe(true);

    for (let i = 0; i < 4; i++) {
      page.querySelector<HTMLInputElement>(`[data-player-id="player-${i}"]`)!.click();
      fixture.detectChanges();
    }

    expect(button('Create session').disabled).toBe(true);

    await fillNames(5);

    expect(button('Confirm result').disabled).toBe(true);

    submit();
    await settle();

    expect(TestBed.inject(SessionStore).sessions()[0].session.history).toHaveLength(0);
    expect(page.querySelector('[data-testid="score-a"]')?.tagName).toBe('BUTTON');
  });

  it('preserves the score draft and matchup after failure, then lets the user retry', async () => {
    await fillNames(5);
    input('[data-testid="score-a"]', '12');
    failSave = true;
    submit();
    await settle();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain('not saved');
    expect(page.querySelector('#match-title')?.textContent).toContain('Match 1');
    expect(page.querySelector<HTMLInputElement>('[data-testid="score-a"]')?.value).toBe('12');

    failSave = false;
    submit();
    await settle();

    expect(page.querySelector('#match-title')?.textContent).toContain('Match 2');
    expect(page.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows a recoverable missing-session state', async () => {
    await TestBed.inject(Router).navigateByUrl('/session/missing');
    await settle();

    expect(page.querySelector('h1')?.textContent).toContain('Session not found');
  });

  it('shows one session panel at a time and retains a draft when switching tabs', async () => {
    await fillNames(5);

    const panel = (id: string) => page.querySelector<HTMLElement>(`#panel-${id}`)!;
    const tab = (id: string) => page.querySelector<HTMLButtonElement>(`#tab-${id}`)!;
    const store = TestBed.inject(SessionStore);
    const announced = store.sessions()[0].session.activeMatch;

    expect(
      [...page.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent?.trim()),
    ).toEqual(['Current match', 'Scoreboard', 'History']);

    expect(panel('current').hidden).toBe(false);
    expect(panel('history').hidden).toBe(true);
    expect(panel('scoreboard').hidden).toBe(true);

    input('[data-testid="score-a"]', '11');
    tab('history').click();
    await settle();

    expect(panel('current').hidden).toBe(true);
    expect(panel('history').hidden).toBe(false);
    expect(tab('history').getAttribute('aria-selected')).toBe('true');

    tab('scoreboard').click();
    await settle();

    expect(panel('history').hidden).toBe(true);
    expect(panel('scoreboard').hidden).toBe(false);
    expect(store.sessions()[0].session.activeMatch).toEqual(announced);
    expect(store.sessions()[0].session.history).toHaveLength(0);

    tab('current').click();
    await settle();

    expect(page.querySelector<HTMLInputElement>('[data-testid="score-a"]')?.value).toBe('11');

    submit();
    await settle();

    expect(panel('current').hidden).toBe(false);
    expect(page.querySelector('#match-title')?.textContent).toContain('Match 2');

    tab('history').click();
    await settle();

    expect(page.querySelectorAll('#panel-history .history-list li')).toHaveLength(1);
  });

  it('supports arrow/Home/End keyboard tab selection with roving focus', async () => {
    await fillNames(5);

    const tab = (id: string) => page.querySelector<HTMLButtonElement>(`#tab-${id}`)!;
    const press = async (id: string, key: string) => {
      tab(id).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      await settle();
    };

    tab('current').focus();
    await press('current', 'ArrowRight');

    expect(document.activeElement).toBe(tab('scoreboard'));
    expect(tab('current').tabIndex).toBe(-1);
    expect(tab('scoreboard').tabIndex).toBe(0);

    await press('scoreboard', 'End');
    expect(document.activeElement).toBe(tab('history'));

    await press('history', 'ArrowRight');
    expect(document.activeElement).toBe(tab('current'));

    await press('current', 'ArrowLeft');
    expect(document.activeElement).toBe(tab('history'));

    await press('history', 'Home');
    expect(document.activeElement).toBe(tab('current'));
  });

  it('opens the scoreboard after ending and when reopening ended results', async () => {
    await fillNames(5);
    button('End session').click();
    await settle();
    button('End session now').click();
    await settle();

    expect(page.querySelector<HTMLElement>('#panel-scoreboard')?.hidden).toBe(false);
    expect(page.querySelector('#panel-current')).toBeNull();
    expect(page.querySelector('#tab-current')).toBeNull();
    expect(page.querySelector('app-session-podium')?.textContent).toContain(
      'No completed matches to rank',
    );

    const id = TestBed.inject(SessionStore).sessions()[0].session.id;
    await TestBed.inject(Router).navigateByUrl('/');
    await settle();
    await TestBed.inject(Router).navigateByUrl(`/session/${id}`);
    await settle();

    expect(page.querySelector<HTMLElement>('#panel-scoreboard')?.hidden).toBe(false);
    expect(page.querySelector('#tab-current')).toBeNull();
  });

  it('shows shared podium places above the two ended-session tabs and keeps keyboard navigation valid', async () => {
    await fillNames(5);
    const store = TestBed.inject(SessionStore);
    const doc = store.sessions()[0];
    const winners = doc.session.activeMatch!.teamA.map(
      (id) => doc.players.find((player) => player.id === id)!.name,
    );

    expect(page.querySelector('app-session-podium')).toBeNull();
    expect(page.querySelector('a[href="/clubhouse/sessions"]')).toBeNull();

    input('[data-testid="score-a"]', '11');
    button('Confirm result').click();
    await settle();

    // An ended state must also invalidate a previously selected current-match tab.
    await store.end(doc.session.id);
    await settle();

    expect(
      [...page.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent?.trim()),
    ).toEqual(['Scoreboard', 'History']);
    expect(page.querySelector('#panel-current')).toBeNull();
    expect(page.querySelector<HTMLElement>('#panel-scoreboard')?.hidden).toBe(false);
    expect(
      [...page.querySelectorAll('.place-1 li')].map((player) => player.textContent?.trim()),
    ).toEqual(winners);
    expect(page.querySelector('.place-1')?.textContent).toContain('Shared place');
    expect(page.querySelectorAll('.place-2 li')).toHaveLength(0);
    expect(page.querySelectorAll('.place-3 li')).toHaveLength(2);
    expect(
      page
        .querySelector('app-session-podium')!
        .compareDocumentPosition(page.querySelector('.session-tabs')!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const historyTab = page.querySelector<HTMLButtonElement>('#tab-history')!;
    historyTab.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    await settle();

    expect(document.activeElement).toBe(page.querySelector('#tab-scoreboard'));
    expect(page.querySelector('#tab-scoreboard')?.getAttribute('aria-selected')).toBe('true');
  });

  it('adds saved players through navigation and reuses their IDs and counts across sessions', async () => {
    raw = null;
    const store = TestBed.inject(SessionStore);
    store.load();

    page.querySelector<HTMLAnchorElement>('nav a[href="/players"]')!.click();
    await settle();

    expect(page.querySelector('h1')?.textContent).toContain('Players');
    expect(page.textContent).toContain('No players yet');

    for (const name of ['Anna', 'Bo', 'Cleo', 'Dan', 'Eva']) {
      input('#player-name', name);
      submit();
      await settle();
    }

    expect(store.players()).toHaveLength(5);
    input('#player-name', ' ANNA ');
    expect(button('Add player').disabled).toBe(true);

    const ids = store.players().map((p) => p.id);
    const chooseGroup = async () => {
      await TestBed.inject(Router).navigateByUrl('/session/new');
      await settle();

      for (const id of ids) {
        page.querySelector<HTMLInputElement>(`[data-player-id="${id}"]`)!.click();
        fixture.detectChanges();
      }

      submit();
      await settle();
      input('[data-testid="score-a"]', '8');
      submit();
      await settle();
    };

    await chooseGroup();
    const first = store.sessions()[0];
    const participant = first.session.history[0].teamA[0];
    expect(first.session.activePlayerIds).toEqual(ids);

    await store.end(first.session.id);
    await chooseGroup();

    expect(store.sessions()[1].session.activePlayerIds).toEqual(ids);
    store.load();
    await TestBed.inject(Router).navigateByUrl('/players');
    await settle();

    expect(store.players().map((p) => p.id)).toEqual(ids);
    expect(page.querySelector(`[data-profile-id="${participant}"]`)?.textContent).toContain(
      '2 sessions played',
    );
  });
});
