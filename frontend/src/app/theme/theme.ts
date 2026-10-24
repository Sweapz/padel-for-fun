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
      return this.document.defaultView?.localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
    } catch {
      return false;
    }
  }

  private apply(): void {
    this.document.documentElement.dataset['theme'] = this.dark() ? 'dark' : 'light';
  }
}
