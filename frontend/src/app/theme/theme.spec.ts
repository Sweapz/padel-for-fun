import { TestBed } from '@angular/core/testing';
import { Theme, THEME_STORAGE_KEY } from './theme';

describe('browser theme preference', () => {
  beforeEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to dark and restores a saved light preference in a new app instance', () => {
    const theme = TestBed.inject(Theme);

    expect(theme.dark()).toBe(true);
    expect(document.documentElement.dataset['theme']).toBe('dark');

    theme.toggle();

    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    TestBed.resetTestingModule();
    const restored = TestBed.inject(Theme);

    expect(restored.dark()).toBe(false);

    restored.toggle();

    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('ignores an invalid stored preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'invalid');

    expect(TestBed.inject(Theme).dark()).toBe(true);
  });

  it('still switches both ways when browser storage cannot be read or written', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    const theme = TestBed.inject(Theme);

    expect(theme.dark()).toBe(true);

    theme.toggle();
    expect(theme.dark()).toBe(false);

    theme.toggle();
    expect(theme.dark()).toBe(true);
  });
});
