import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { SessionStore } from './data/session-store';

describe('Application navigation', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }),
  );

  async function openPage(url: string) {
    const fixture = TestBed.createComponent(App);

    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
    fixture.detectChanges();

    return fixture;
  }

  it('shows three navigation links with Clubhouse selected and branding in the footer', async () => {
    const fixture = await openPage('/');
    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelector('main h1')?.textContent).toContain('padel for fun');
    expect([...page.querySelectorAll('nav a')].map((a) => a.textContent?.trim())).toEqual([
      'Clubhouse',
      'Session',
      'Players',
    ]);
    expect(page.querySelector('nav a[aria-current="page"]')?.textContent).toContain('Clubhouse');
    expect(page.querySelector('.skip-link')?.getAttribute('href')).toBe('#main-content');
    expect(page.querySelector('header .brand')).toBeNull();
    expect(page.querySelector('footer .brand')?.textContent).toContain('padel for fun');
    expect(page.querySelector('.site-header button')).toBeNull();
  });

  it('toggles the current ruleset over the court without navigating away', async () => {
    const fixture = await openPage('/');
    const page = fixture.nativeElement as HTMLElement;
    const toggle = page.querySelector<HTMLButtonElement>('[aria-controls="current-ruleset"]')!;
    const rules = page.querySelector<HTMLElement>('#current-ruleset')!;

    expect(rules.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    toggle.click();
    fixture.detectChanges();

    expect(rules.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(page.querySelector('.court')?.getAttribute('aria-hidden')).toBe('true');
    expect(TestBed.inject(Router).url).toBe('/');

    toggle.click();
    fixture.detectChanges();

    expect(rules.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(page.querySelector('.court')?.hasAttribute('aria-hidden')).toBe(false);
  });

  it('moves the selected highlight when navigating between sections', async () => {
    const fixture = await openPage('/');
    const page = fixture.nativeElement as HTMLElement;

    page.querySelector<HTMLAnchorElement>('nav a[href="/session/new"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/session/new');
    expect(page.querySelector('main h1')?.textContent).toContain('Bring your group');
    expect(page.querySelectorAll('nav .active')).toHaveLength(1);
    expect(page.querySelector('nav .active')?.textContent).toBe('Session');

    page.querySelector<HTMLAnchorElement>('nav a[href="/players"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.querySelectorAll('nav .active')).toHaveLength(1);
    expect(page.querySelector('nav a[aria-current="page"]')?.textContent).toBe('Players');
  });

  it('keeps the corresponding section selected on detail pages', async () => {
    const fixture = await openPage('/session/example');
    const page = fixture.nativeElement as HTMLElement;
    await TestBed.inject(SessionStore).initialized;
    fixture.detectChanges();

    expect(page.querySelector('nav .active')?.textContent).toBe('Session');

    await TestBed.inject(Router).navigateByUrl('/players/example');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.querySelectorAll('nav .active')).toHaveLength(1);
    expect(page.querySelector('nav .active')?.textContent).toBe('Players');
  });

  it('redirects unknown routes to Clubhouse', async () => {
    const fixture = await openPage('/does-not-exist');
    const page = fixture.nativeElement as HTMLElement;

    expect(TestBed.inject(Router).url).toBe('/');
    expect(page.querySelector('nav .active')?.textContent).toBe('Clubhouse');
  });

  it('keeps Clubhouse highlighted on the full session archive', async () => {
    const fixture = await openPage('/clubhouse/sessions');
    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelector('main h1')?.textContent).toBe('Previous sessions');
    expect(page.querySelectorAll('nav .active')).toHaveLength(1);
    expect(page.querySelector('nav .active')?.textContent).toBe('Clubhouse');
  });
});
