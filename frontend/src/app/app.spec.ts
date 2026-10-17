import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';

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

  it('opens the home route inside the accessible application shell', async () => {
    const fixture = await openPage('/');
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('main h1')?.textContent).toContain('Keep the game');
    expect(page.querySelector('a[aria-current="page"]')?.textContent).toContain('Your court');
    expect(page.querySelector('.skip-link')?.getAttribute('href')).toBe('#main-content');
  });

  it('opens session setup through the home page link', async () => {
    const fixture = await openPage('/');
    const page = fixture.nativeElement as HTMLElement;
    page.querySelector<HTMLAnchorElement>('main a')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/session/new');
    expect(page.querySelector('main h1')?.textContent).toContain('Bring your group');
  });

  it('redirects unknown routes to home', async () => {
    const fixture = await openPage('/does-not-exist');
    const page = fixture.nativeElement as HTMLElement;
    expect(TestBed.inject(Router).url).toBe('/');
    expect(page.querySelector('main h1')?.textContent).toContain('Keep the game');
  });
});
