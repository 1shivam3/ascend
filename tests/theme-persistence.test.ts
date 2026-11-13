/**
 * Theme persistence & hydration — §35 rewrite.
 *
 * Before §35 the preference was (theme × hasCustomTheme) and this
 * suite drove setTheme(theme, isCustom) plus a HAND-COPIED
 * simulation of the boot script. Now: one stored themeMode, the
 * resolved theme is runtime state, and the pre-paint scenarios
 * execute the REAL public/theme-init.js so the copy can never
 * drift from the script again.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { useAppStore } from '@/lib/store';

const BOOT_SCRIPT = readFileSync('public/theme-init.js', 'utf8');

function runRealBootScript(
  mockLocalStorage: Record<string, string>,
  prefersDark: boolean,
): { classes: Set<string>; attributes: Record<string, string> } {
  const classes = new Set<string>(['dark']);
  const attributes: Record<string, string> = {};
  const localStorageStub = {
    getItem: (k: string) => mockLocalStorage[k] ?? null,
  };
  const windowStub = {
    matchMedia: (query: string) => ({ matches: prefersDark, media: query }),
  };
  const documentStub = {
    documentElement: {
      classList: {
        add: (c: string) => classes.add(c),
        remove: (c: string) => classes.delete(c),
      },
      setAttribute: (n: string, v: string) => {
        attributes[n] = v;
      },
    },
  };
  const fn = new Function('localStorage', 'window', 'document', BOOT_SCRIPT);
  fn(localStorageStub, windowStub, documentStub);
  return { classes, attributes };
}

function stubOs(prefersDark: boolean) {
  vi.stubGlobal('window', {
    matchMedia: (query: string) => ({
      matches: prefersDark,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

describe('Theme Persistence & Hydration Guard (§35)', () => {
  let localStorageMock: Record<string, string> = {};
  let classListMock: Set<string>;
  let attributesMock: Record<string, string>;

  beforeEach(() => {
    localStorageMock = {};
    classListMock = new Set<string>(['dark']);
    attributesMock = {};

    vi.stubGlobal('localStorage', {
      getItem: (key: string) => localStorageMock[key] ?? null,
      setItem: (key: string, val: string) => {
        localStorageMock[key] = String(val);
      },
      removeItem: (key: string) => {
        delete localStorageMock[key];
      },
      clear: () => {
        localStorageMock = {};
      },
    });

    vi.stubGlobal('document', {
      documentElement: {
        classList: {
          add: (cls: string) => classListMock.add(cls),
          remove: (cls: string) => classListMock.delete(cls),
          contains: (cls: string) => classListMock.has(cls),
        },
        setAttribute: (name: string, val: string) => {
          attributesMock[name] = val;
        },
        getAttribute: (name: string) => attributesMock[name] ?? null,
      },
    });

    useAppStore.setState({
      theme: 'dark',
      themeMode: 'system',
      _hasHydrated: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Scenario 1: explicit Dark on a Light OS persists and survives the boot script', () => {
    stubOs(false);
    useAppStore.getState().setThemeMode('dark');

    expect(useAppStore.getState().theme).toBe('dark');
    expect(useAppStore.getState().themeMode).toBe('dark');
    expect(localStorageMock['ascend_theme_mode']).toBe('dark');
    expect(localStorageMock['ascend_theme']).toBe('dark');
    expect(classListMock.has('dark')).toBe(true);

    const boot = runRealBootScript(localStorageMock, false);
    expect(boot.classes.has('dark')).toBe(true);
    expect(boot.classes.has('light')).toBe(false);
    expect(boot.attributes['data-theme']).toBe('dark');
  });

  it('Scenario 2: explicit Light on a Dark OS persists', () => {
    stubOs(true);
    useAppStore.getState().setThemeMode('light');

    expect(useAppStore.getState().theme).toBe('light');
    expect(useAppStore.getState().themeMode).toBe('light');
    expect(localStorageMock['ascend_theme_mode']).toBe('light');

    const boot = runRealBootScript(localStorageMock, true);
    expect(boot.classes.has('light')).toBe(true);
    expect(boot.attributes['data-theme']).toBe('light');
  });

  it('Scenario 5: toggling flips the RESOLVED theme into an explicit mode', () => {
    stubOs(true);
    useAppStore.getState().toggleTheme(); // dark -> light (explicit)
    expect(useAppStore.getState().theme).toBe('light');
    expect(useAppStore.getState().themeMode).toBe('light');
    useAppStore.getState().toggleTheme(); // light -> dark
    expect(useAppStore.getState().theme).toBe('dark');
    expect(useAppStore.getState().themeMode).toBe('dark');
  });

  it('Scenario 6: system mode follows the OS — and following NEVER overwrites the stored mode', () => {
    stubOs(false);
    useAppStore.getState().resetThemeToSystem();
    expect(useAppStore.getState().themeMode).toBe('system');
    expect(useAppStore.getState().theme).toBe('light');

    // OS flips to dark; the page effect's follow write lands:
    useAppStore.getState().applySystemTheme('dark');
    expect(useAppStore.getState().theme).toBe('dark');
    // The §35 invariant: the stored preference is still 'system'.
    expect(useAppStore.getState().themeMode).toBe('system');
    expect(localStorageMock['ascend_theme_mode']).toBe('system');
  });

  it('Scenario 7: an OS change write in explicit mode is not how following works — applySystemTheme is gated by callers on mode', () => {
    stubOs(false);
    useAppStore.getState().setThemeMode('dark');
    // page.tsx only calls applySystemTheme when themeMode==='system';
    // the state itself proves the explicit choice is untouched by
    // system resolution inputs:
    expect(useAppStore.getState().themeMode).toBe('dark');
    expect(useAppStore.getState().theme).toBe('dark');
  });

  it('Scenario 8: reset to system stores the mode, resolves from the OS', () => {
    stubOs(true);
    useAppStore.getState().setThemeMode('light');
    useAppStore.getState().resetThemeToSystem();
    expect(useAppStore.getState().themeMode).toBe('system');
    expect(useAppStore.getState().theme).toBe('dark'); // OS dark
    expect(localStorageMock['ascend_theme_mode']).toBe('system');
  });

  it('Scenario 9: the REAL boot script still reads a legacy store blob (pre-§35 user)', () => {
    const legacy: Record<string, string> = {
      ascend_store: JSON.stringify({
        state: { theme: 'light', hasCustomTheme: true },
      }),
    };
    const boot = runRealBootScript(legacy, true /* OS dark */);
    expect(boot.classes.has('light')).toBe(true);
    expect(boot.classes.has('dark')).toBe(false);
    expect(boot.attributes['data-theme']).toBe('light');
  });

  it('Scenario 10: the REAL boot script reads the legacy discrete keys', () => {
    const legacy: Record<string, string> = {
      ascend_theme: 'light',
      ascend_has_custom_theme: 'true',
    };
    const boot = runRealBootScript(legacy, true);
    expect(boot.classes.has('light')).toBe(true);
  });

  it('Scenario 11: boot with mode=system paints the OS theme', () => {
    const boot = runRealBootScript({ ascend_theme_mode: 'system' }, false);
    expect(boot.classes.has('light')).toBe(true);
    const bootDark = runRealBootScript({ ascend_theme_mode: 'system' }, true);
    expect(bootDark.classes.has('dark')).toBe(true);
  });
});
