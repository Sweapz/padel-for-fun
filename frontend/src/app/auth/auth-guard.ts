import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { SharedAuth } from './shared-auth';

export const requireSignIn: CanActivateFn = async (_route, state) => {
  const auth = inject(SharedAuth);
  const router = inject(Router);

  await auth.initialized;

  return !auth.shared || auth.signedIn()
    ? true
    : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export function safeReturnUrl(value: string | null): string {
  return value?.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !value.startsWith('/login')
    ? value
    : '/';
}

export const showLogin: CanActivateFn = async () => {
  const auth = inject(SharedAuth);
  const router = inject(Router);

  await auth.initialized;

  return auth.shared && !auth.signedIn() ? true : router.createUrlTree(['/']);
};
