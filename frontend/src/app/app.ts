import { Component, computed, effect, inject, signal } from '@angular/core';
import { SharedAuth } from './auth/shared-auth';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);
  readonly auth = inject(SharedAuth);

  private readonly currentUrl = signal(this.router.url);

  readonly sessionActive = computed(() =>
    this.currentUrl().split(/[?#]/)[0].startsWith('/session/'),
  );

  constructor() {
    let wasSignedIn = false;
    effect(() => {
      const signedIn = this.auth.signedIn();
      if (!this.auth.ready()) return;

      if (this.auth.shared && wasSignedIn && !signedIn && !this.router.url.startsWith('/login')) {
        void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      }
      wasSignedIn = signedIn;
    });

    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd) this.currentUrl.set(event.urlAfterRedirects);
    });
  }
}
