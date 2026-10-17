import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
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

  readonly menuOpen = signal(false);
  readonly navigation = viewChild<ElementRef<HTMLElement>>('navigation');
  readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd) this.menuOpen.set(false);
    });
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
