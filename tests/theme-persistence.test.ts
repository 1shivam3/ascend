import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useAppStore } from '@/lib/store';

// Helper to simulate pre-paint inline script from layout.tsx and theme-init.js
function runPrePaintScript(mockDocument: { classList: Set<string>; attributes: Record<string, string> }, mockLocalStorage: Record<string, string>, prefersDark: boolean) {
  try {
    let theme: string | null = null;
    let hasCustom = false;
    const customFlag = mockLocalStorage['ascend_has_custom_theme'];
    const standaloneTheme = mockLocalStorage['ascend_theme'];

    if (customFlag === 'true' && (standaloneTheme === 'dark' || standaloneTheme === 'light')) {
      theme = standaloneTheme;
      hasCustom = true;
    } else if (customFlag === 'false') {
      hasCustom = false;
    } else {
      const stored = mockLocalStorage['ascend_store'];
      if (stored) {
        const parsed = JSON.parse(stored);
        const s = parsed.state || parsed;
        if (s && s.hasCustomTheme) {
          theme = s.theme;
          hasCustom = true;
        }
      }
    }

    if (!hasCustom) {
      theme = prefersDark ? 'dark' : 'light';
    }

    if (theme === 'light') {
      mockDocument.classList.delete('dark');
      mockDocument.classList.add('light');
      mockDocument.attributes['data-theme'] = 'light';
    } else if (theme === 'dark') {
      mockDocument.classList.add('dark');
      mockDocument.classList.delete('light');
      mockDocument.attributes['data-theme'] = 'dark';
    }
  } catch (e) {}
}

describe('Theme Persistence & Hydration Guard', () => {
  let localStorageMock: Record<string, string> = {};
  let classListMock: Set<string>;
  let attributesMock: Record<string, string>;

  beforeEach(() => {
    localStorageMock = {};
    classListMock = new Set<string>(['dark']);
    attributesMock = {};

    // Mock localStorage
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

    // Mock document.documentElement
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

    // Reset store
    useAppStore.setState({
      theme: 'dark',
      hasCustomTheme: false,
      _hasHydrated: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Scenario 1: Device Light + Explicit Dark ──
  it('Scenario 1: Explicit Dark mode on Light OS persists and is not overridden on refresh', () => {
    // 1. Device is Light
    let prefersDark = false;
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({
        matches: prefersDark,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    // 2. User explicitly toggles or sets Dark mode
    useAppStore.getState().setTheme('dark', true);

    expect(useAppStore.getState().theme).toBe('dark');
    expect(useAppStore.getState().hasCustomTheme).toBe(true);
    expect(localStorageMock['ascend_theme']).toBe('dark');
    expect(localStorageMock['ascend_has_custom_theme']).toBe('true');
    expect(classListMock.has('dark')).toBe(true);
    expect(classListMock.has('light')).toBe(false);

    // 3. Simulate page refresh:
    // First, pre-paint inline script runs before React/Zustand:
    const prePaintDoc = { classList: new Set(['dark']), attributes: {} as Record<string, string> };
    runPrePaintScript(prePaintDoc, localStorageMock, prefersDark);
    expect(prePaintDoc.classList.has('dark')).toBe(true);
    expect(prePaintDoc.classList.has('light')).toBe(false);
    expect(prePaintDoc.attributes['data-theme']).toBe('dark');

    // Second, Zustand starts unhydrated (_hasHydrated: false)
    useAppStore.setState({ _hasHydrated: false });

    // Simulate page.tsx theme sync effect while _hasHydrated is false:
    // It must return immediately and NOT overwrite user's theme!
    const syncThemeEffect = () => {
      const state = useAppStore.getState();
      if (!state._hasHydrated) return; // The critical hydration guard!
      const mediaQueryMatches = prefersDark;
      if (!state.hasCustomTheme) {
        const deviceTheme = mediaQueryMatches ? 'dark' : 'light';
        if (state.theme !== deviceTheme) {
          state.setTheme(deviceTheme, false);
        }
      }
    };

    syncThemeEffect();
    // Verify theme was NOT overridden during unhydrated mount
    expect(useAppStore.getState().theme).toBe('dark');
    expect(useAppStore.getState().hasCustomTheme).toBe(true);

    // Third, Zustand rehydrates
    useAppStore.setState({ _hasHydrated: true });
    syncThemeEffect();

    // Verify theme is STILL dark and hasCustomTheme is true
    expect(useAppStore.getState().theme).toBe('dark');
    expect(useAppStore.getState().hasCustomTheme).toBe(true);
  });

  // ── Scenario 2: Device Dark + Explicit Light ──
  it('Scenario 2: Explicit Light mode on Dark OS persists across page refresh', () => {
    let prefersDark = true;
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({
        matches: prefersDark,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    // User chooses Light mode
    useAppStore.getState().setTheme('light', true);

    expect(useAppStore.getState().theme).toBe('light');
    expect(useAppStore.getState().hasCustomTheme).toBe(true);
    expect(localStorageMock['ascend_theme']).toBe('light');
    expect(localStorageMock['ascend_has_custom_theme']).toBe('true');
    expect(classListMock.has('light')).toBe(true);
    expect(classListMock.has('dark')).toBe(false);

    // Pre-paint script verification
    const prePaintDoc = { classList: new Set(['dark']), attributes: {} as Record<string, string> };
    runPrePaintScript(prePaintDoc, localStorageMock, prefersDark);
    expect(prePaintDoc.classList.has('light')).toBe(true);
    expect(prePaintDoc.classList.has('dark')).toBe(false);
    expect(prePaintDoc.attributes['data-theme']).toBe('light');
  });

  // ── Scenario 3: Device Light + Explicit Light ──
  it('Scenario 3: Explicit Light mode on Light OS persists', () => {
    let prefersDark = false;
    useAppStore.getState().setTheme('light', true);

    expect(useAppStore.getState().theme).toBe('light');
    expect(useAppStore.getState().hasCustomTheme).toBe(true);
    expect(localStorageMock['ascend_theme']).toBe('light');
    expect(localStorageMock['ascend_has_custom_theme']).toBe('true');
  });

  // ── Scenario 4: Device Dark + Explicit Dark ──
  it('Scenario 4: Explicit Dark mode on Dark OS persists as custom', () => {
    let prefersDark = true;
    useAppStore.getState().setTheme('dark', true);

    expect(useAppStore.getState().theme).toBe('dark');
    expect(useAppStore.getState().hasCustomTheme).toBe(true);
    expect(localStorageMock['ascend_theme']).toBe('dark');
    expect(localStorageMock['ascend_has_custom_theme']).toBe('true');
  });

  // ── Scenario 5: Multiple Toggles ──
  it('Scenario 5: User toggling multiple times correctly preserves the final preference', () => {
    useAppStore.getState().toggleTheme(); // dark -> light
    expect(useAppStore.getState().theme).toBe('light');
    expect(useAppStore.getState().hasCustomTheme).toBe(true);
    expect(localStorageMock['ascend_theme']).toBe('light');

    useAppStore.getState().toggleTheme(); // light -> dark
    expect(useAppStore.getState().theme).toBe('dark');
    expect(useAppStore.getState().hasCustomTheme).toBe(true);
    expect(localStorageMock['ascend_theme']).toBe('dark');

    useAppStore.getState().toggleTheme(); // dark -> light
    expect(useAppStore.getState().theme).toBe('light');
    expect(useAppStore.getState().hasCustomTheme).toBe(true);
    expect(localStorageMock['ascend_theme']).toBe('light');
  });

  // ── Scenario 6: System/Auto Mode Synchronization ──
  it('Scenario 6: System/Auto mode follows device OS theme and updates on OS change', () => {
    let currentPrefersDark = false;
    let changeListener: ((e: { matches: boolean }) => void) | null = null;

    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({
        matches: currentPrefersDark,
        media: query,
        addEventListener: (_evt: string, cb: (e: { matches: boolean }) => void) => {
          changeListener = cb;
        },
        removeEventListener: vi.fn(),
      }),
    });

    // Reset to system mode
    useAppStore.getState().resetThemeToSystem();

    expect(useAppStore.getState().hasCustomTheme).toBe(false);
    expect(useAppStore.getState().theme).toBe('light'); // Matches Light OS
    expect(classListMock.has('light')).toBe(true);

    // Simulate OS appearance change: Light -> Dark
    currentPrefersDark = true;
    const storeState = useAppStore.getState();
    if (!storeState.hasCustomTheme) {
      storeState.setTheme(currentPrefersDark ? 'dark' : 'light', false);
    }

    expect(useAppStore.getState().theme).toBe('dark');
    expect(useAppStore.getState().hasCustomTheme).toBe(false);
    expect(classListMock.has('dark')).toBe(true);
  });

  // ── Scenario 7: OS Theme Change does NOT override Explicit Custom Theme ──
  it('Scenario 7: OS appearance change does NOT override explicit user choice', () => {
    let currentPrefersDark = false;
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({
        matches: currentPrefersDark,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    // User explicitly sets Dark mode
    useAppStore.getState().setTheme('dark', true);
    expect(useAppStore.getState().hasCustomTheme).toBe(true);
    expect(useAppStore.getState().theme).toBe('dark');

    // OS switches to Light (or user changes system settings)
    currentPrefersDark = false;
    const handleDeviceChange = (matches: boolean) => {
      const storeState = useAppStore.getState();
      if (!storeState.hasCustomTheme) {
        storeState.setTheme(matches ? 'dark' : 'light', false);
      }
    };

    handleDeviceChange(currentPrefersDark);

    // Still dark!
    expect(useAppStore.getState().theme).toBe('dark');
    expect(useAppStore.getState().hasCustomTheme).toBe(true);
  });

  // ── Scenario 8: Reset to System ──
  it('Scenario 8: Reset to System clears custom flag and syncs with OS', () => {
    let prefersDark = true;
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({
        matches: prefersDark,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    // User had custom Light theme
    useAppStore.getState().setTheme('light', true);
    expect(useAppStore.getState().hasCustomTheme).toBe(true);

    // User clicks "Reset to System"
    useAppStore.getState().resetThemeToSystem();

    expect(useAppStore.getState().hasCustomTheme).toBe(false);
    expect(useAppStore.getState().theme).toBe('dark'); // matches prefersDark
    expect(localStorageMock['ascend_has_custom_theme']).toBe('false');
  });

  // ── Scenario 9: Legacy Storage Fallback ──
  it('Scenario 9: Pre-paint script gracefully reads legacy ascend_store if discrete keys are not yet set', () => {
    const legacyLocalStorage: Record<string, string> = {
      ascend_store: JSON.stringify({
        state: {
          theme: 'light',
          hasCustomTheme: true,
        },
      }),
    };

    const doc = { classList: new Set(['dark']), attributes: {} as Record<string, string> };
    runPrePaintScript(doc, legacyLocalStorage, true /* OS is dark */);

    // Should read 'light' from legacy store and apply light theme even though OS is dark
    expect(doc.classList.has('light')).toBe(true);
    expect(doc.classList.has('dark')).toBe(false);
    expect(doc.attributes['data-theme']).toBe('light');
  });
});
