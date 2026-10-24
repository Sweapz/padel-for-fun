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
    document.documentElement.style.removeProperty('--browser-theme');
    document.querySelectorAll('meta[data-theme-test]').forEach((meta) => meta.remove());
  });

  it('updates browser chrome metadata from the active CSS colour and selected scheme', () => {
    for (const name of ['theme-color', 'color-scheme']) {
      const meta = document.createElement('meta');
      meta.name = name;
      meta.dataset['themeTest'] = '';
      document.head.append(meta);
    }

    document.documentElement.style.setProperty('--browser-theme', '#101b17');
    const theme = TestBed.inject(Theme);
    const content = (name: string) =>
      document.querySelector(`meta[name="${name}"]`)?.getAttribute('content');

    expect(content('theme-color')).toBe('#101b17');
    expect(content('color-scheme')).toBe('dark');

    document.documentElement.style.setProperty('--browser-theme', '#183e34');
    theme.toggle();

    expect(content('theme-color')).toBe('#183e34');
    expect(content('color-scheme')).toBe('light');

    document.documentElement.style.setProperty('--browser-theme', '#101b17');
    theme.toggle();

    expect(content('theme-color')).toBe('#101b17');
    expect(content('color-scheme')).toBe('dark');
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
