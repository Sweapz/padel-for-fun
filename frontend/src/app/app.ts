import { Component, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { SharedAuth } from './auth/shared-auth';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
  host: {
    '(document:click)': 'closeMenuOutside($event)',
    '(document:keydown.escape)': 'closeMenuWithEscape($event)',
  },
})
export class App {
  private readonly router = inject(Router);
  readonly auth = inject(SharedAuth);

  readonly menuOpen = signal(false);
  readonly navigation = viewChild<ElementRef<HTMLElement>>('navigation');
  readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');

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
      if (event instanceof NavigationEnd) this.menuOpen.set(false);
    });
  }

  async signOut(): Promise<void> {
    this.menuOpen.set(false);
    await this.auth.signOut();
    await this.router.navigate(['/login']);
  }

  closeMenuOutside(event: Event): void {
    if (!this.navigation()?.nativeElement.contains(event.target as Node)) this.menuOpen.set(false);
  }

  closeMenuWithEscape(event: Event): void {
    if (!this.menuOpen()) return;

    event.preventDefault();
    this.menuOpen.set(false);
    this.menuButton()?.nativeElement.focus();
  }

  closeMenuOnFocusOut(event: FocusEvent): void {
    if (!this.navigation()?.nativeElement.contains(event.relatedTarget as Node | null)) {
      this.menuOpen.set(false);
    }
  }
}
