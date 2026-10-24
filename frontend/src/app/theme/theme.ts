import { DOCUMENT, inject, Injectable, signal } from '@angular/core';

export const THEME_STORAGE_KEY = 'padel-for-fun.theme';

@Injectable({ providedIn: 'root' })
export class Theme {
  private readonly document = inject(DOCUMENT);
  private readonly enabled = signal(this.savedDarkMode());

  readonly dark = this.enabled.asReadonly();

  constructor() {
    this.apply();
  }

  toggle(): void {
    this.enabled.update((dark) => !dark);
    this.apply();

    try {
      this.document.defaultView?.localStorage.setItem(
        THEME_STORAGE_KEY,
        this.dark() ? 'dark' : 'light',
      );
    } catch {
      // The switch still works for this visit when browser storage is unavailable.
    }
  }

  private savedDarkMode(): boolean {
    try {
      return this.document.defaultView?.localStorage.getItem(THEME_STORAGE_KEY) !== 'light';
    } catch {
      return true;
    }
  }

  private apply(): void {
    const root = this.document.documentElement;
    const scheme = this.dark() ? 'dark' : 'light';

    root.dataset['theme'] = scheme;
    this.document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', scheme);

    // Read the active CSS token so the phone chrome and page palette stay in sync.
    const browserColor = this.document.defaultView
      ?.getComputedStyle(root)
      .getPropertyValue('--browser-theme')
      .trim();

    if (browserColor) {
      this.document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', browserColor);
    }
  }
}
