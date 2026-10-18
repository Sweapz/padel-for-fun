import { TestBed } from '@angular/core/testing';
import { SharedAuth, SUPABASE_CLIENT, AUTH_STORAGE_KEY } from './shared-auth';
import { APP_SETTINGS } from '../data/runtime-settings';
import { safeReturnUrl } from './auth-guard';
import { provideRouter, Router } from '@angular/router';
import { App } from '../app';
import { routes } from '../app.routes';
import { SharedRepository } from '../data/shared-repository';

describe('shared password authentication', () => {
  const sdk = {
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: { id: 'shared-user' } }, error: null })),
    signInWithPassword: vi.fn(async () => ({ data: { user: { id: 'shared-user' } }, error: null })),
    signOut: vi.fn(async () => undefined),
    startAutoRefresh: vi.fn(async () => undefined),
    stopAutoRefresh: vi.fn(async () => undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: APP_SETTINGS,
          useValue: {
            mode: 'supabase',
            url: 'http://localhost:54321',
            publishableKey: 'sb_publishable_test',
            loginEmail: 'group@example.com',
          },
        },
        { provide: SUPABASE_CLIENT, useValue: { auth: sdk } },
      ],
    });
  });

  it('submits the configured identifier and password without storing the password', async () => {
    const auth = TestBed.inject(SharedAuth);
    await auth.initialized;

    expect(await auth.signIn('test-password')).toBe(true);
    expect(sdk.signInWithPassword).toHaveBeenCalledWith({
      email: 'group@example.com',
      password: 'test-password',
    });
    expect(auth.userId()).toBe('shared-user');
  });

  it('shows a safe error for an incorrect password', async () => {
    sdk.signInWithPassword.mockRejectedValueOnce(new Error('private SDK detail'));
    const auth = TestBed.inject(SharedAuth);
    await auth.initialized;

    expect(await auth.signIn('wrong')).toBe(false);
    expect(auth.error()).not.toContain('private SDK');
    expect(auth.signedIn()).toBe(false);
  });

  it('clears group identity and cached auth even when the sign-out network call fails', async () => {
    const auth = TestBed.inject(SharedAuth);
    await auth.initialized;
    await auth.signIn('test-password');
    localStorage.setItem(AUTH_STORAGE_KEY, 'test-cache');
    sdk.signOut.mockRejectedValueOnce(new Error('Network unavailable.'));
    const listener = vi.fn();
    auth.onIdentityChange(listener);

    await auth.signOut();

    expect(auth.signedIn()).toBe(false);
    expect(listener).toHaveBeenCalled();
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(sdk.stopAutoRefresh).toHaveBeenCalled();
  });

  it('keeps post-login destinations inside the app', () => {
    expect(safeReturnUrl('/players')).toBe('/players');
    expect(safeReturnUrl('//unrelated.example')).toBe('/');
    expect(safeReturnUrl('/\\unrelated.example')).toBe('/');
    expect(safeReturnUrl('/login')).toBe('/');
  });

  it('returns to the protected page rather than overwriting the destination during initial restoration', async () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        {
          provide: SharedRepository,
          useValue: {
            load: async () => ({ groupId: 'group', library: { players: [], sessions: [] } }),
            knownCreations: async () => [],
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/players');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.parseUrl(router.url).queryParams['returnUrl']).toBe('/players');
    const input = fixture.nativeElement.querySelector('input[type=password]') as HTMLInputElement;
    input.value = 'test-password';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/players');
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Players');
  });
});
