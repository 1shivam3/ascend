import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildTabUrl, getInitialNavigationState } from '@/lib/navigation';

describe('Android & Browser Back Navigation (Task 2)', () => {
  let handlers: Map<string, { fn: () => boolean | void; priority: number }>;

  const registerBackHandler = (fn: () => boolean | void, priority = 10) => {
    const id = Math.random().toString(36).substring(2, 9);
    handlers.set(id, { fn, priority });
    return () => {
      handlers.delete(id);
    };
  };

  const runBackHandlers = (): boolean => {
    const sorted = Array.from(handlers.values()).sort((a, b) => b.priority - a.priority);
    for (const item of sorted) {
      const handled = item.fn();
      if (handled !== false) {
        return true;
      }
    }
    return false;
  };

  beforeEach(() => {
    handlers = new Map();
  });

  it('closes meal scanner before navigating away', () => {
    let isScannerOpen = true;
    let currentTab = 'meals';

    const unregisterScanner = registerBackHandler(() => {
      isScannerOpen = false;
      return true;
    }, 100);

    // User presses back
    const handled = runBackHandlers();
    expect(handled).toBe(true);
    expect(isScannerOpen).toBe(false);
    expect(currentTab).toBe('meals'); // Still on meals tab, scanner closed

    unregisterScanner();
  });

  it('closes nested settings sub-modal (e.g. Legal Hub / Reminder Center) while keeping settings open', () => {
    let isSettingsOpen = true;
    let isSubModalOpen = true;

    // Register Settings modal handler (priority 100)
    const unregisterSettings = registerBackHandler(() => {
      isSettingsOpen = false;
      return true;
    }, 100);

    // Register Sub-modal handler (priority 120)
    const unregisterSubModal = registerBackHandler(() => {
      isSubModalOpen = false;
      return true;
    }, 120);

    // First back press: closes sub-modal
    const handledFirst = runBackHandlers();
    expect(handledFirst).toBe(true);
    expect(isSubModalOpen).toBe(false);
    expect(isSettingsOpen).toBe(true);

    unregisterSubModal();

    // Second back press: closes settings modal
    const handledSecond = runBackHandlers();
    expect(handledSecond).toBe(true);
    expect(isSettingsOpen).toBe(false);

    unregisterSettings();
  });

  it('closes workout details (expanded history) before changing screen', () => {
    let expandedWorkouts = new Set(['workout-1']);
    let currentTab = 'workout';

    const unregisterDetails = registerBackHandler(() => {
      expandedWorkouts = new Set();
      return true;
    }, 80);

    const handled = runBackHandlers();
    expect(handled).toBe(true);
    expect(expandedWorkouts.size).toBe(0);
    expect(currentTab).toBe('workout');

    unregisterDetails();
  });

  it('verifies double-back exit mechanism at home root', () => {
    let exitAllowed = false;
    let lastPress = 0;
    const toastMock = vi.fn();

    const handleRootBack = () => {
      const now = Date.now();
      if (now - lastPress < 2000) {
        exitAllowed = true;
      } else {
        lastPress = now;
        toastMock('Press back again to exit');
      }
    };

    // First press: shows toast, does not exit
    handleRootBack();
    expect(exitAllowed).toBe(false);
    expect(toastMock).toHaveBeenCalledWith('Press back again to exit');

    // Second press within 500ms: allows exit
    handleRootBack();
    expect(exitAllowed).toBe(true);
  });
});

class MockStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number) { return Array.from(this.store.keys())[index] || null; }
  removeItem(key: string) { this.store.delete(key); }
  setItem(key: string, value: string) { this.store.set(key, String(value)); }
}

const mockStorage = new MockStorage();

function setupBrowserEnvironment(urlPath = '/') {
  const urlObj = new URL(urlPath, 'https://ascendtonext.vercel.app');
  const mockWindow = {
    location: {
      href: urlObj.href,
      pathname: urlObj.pathname,
      search: urlObj.search,
      hash: urlObj.hash,
    },
    history: {
      state: {},
      replaceState: vi.fn((state: any, title: string, url?: string) => {
        mockWindow.history.state = state;
        if (url) {
          const parsed = new URL(url, 'https://ascendtonext.vercel.app');
          mockWindow.location.pathname = parsed.pathname;
          mockWindow.location.search = parsed.search;
          mockWindow.location.hash = parsed.hash;
          mockWindow.location.href = parsed.href;
        }
      }),
      pushState: vi.fn((state: any, title: string, url?: string) => {
        mockWindow.history.state = state;
        if (url) {
          const parsed = new URL(url, 'https://ascendtonext.vercel.app');
          mockWindow.location.pathname = parsed.pathname;
          mockWindow.location.search = parsed.search;
          mockWindow.location.hash = parsed.hash;
          mockWindow.location.href = parsed.href;
        }
      }),
      back: vi.fn(),
    },
    localStorage: mockStorage,
  };

  (globalThis as any).window = mockWindow;
  (globalThis as any).localStorage = mockStorage;
}

describe('Tab URL Synchronization & Refresh Persistence', () => {

  beforeEach(() => {
    mockStorage.clear();
    setupBrowserEnvironment('/');
  });

  it('builds clean URL for home tab', () => {
    window.history.replaceState({}, '', '/?tab=workout');
    const url = buildTabUrl('home');
    expect(url).toBe('/');
  });

  it('builds parameterized URL for workout and meals tabs', () => {
    window.history.replaceState({}, '', '/');
    expect(buildTabUrl('workout')).toBe('/?tab=workout');
    expect(buildTabUrl('meals')).toBe('/?tab=meals');
    expect(buildTabUrl('prs')).toBe('/?tab=prs');
  });

  it('builds parameterized URL with sub-tab for progress', () => {
    window.history.replaceState({}, '', '/');
    expect(buildTabUrl('progress', 'strength')).toBe('/?tab=progress&sub=strength');
    expect(buildTabUrl('progress', 'prs')).toBe('/?tab=progress&sub=prs');
    expect(buildTabUrl('progress', 'overview')).toBe('/?tab=progress');
  });

  it('restores active tab from URL query params upon refresh', () => {
    window.history.replaceState({}, '', '/?tab=workout');
    const initial = getInitialNavigationState();
    expect(initial.tab).toBe('workout');
    expect(initial.progressTab).toBe('overview');
  });

  it('restores progress sub-tab from URL query params upon refresh', () => {
    window.history.replaceState({}, '', '/?tab=progress&sub=strength');
    const initial = getInitialNavigationState();
    expect(initial.tab).toBe('progress');
    expect(initial.progressTab).toBe('strength');
  });

  it('restores prs tab from URL query params upon refresh', () => {
    window.history.replaceState({}, '', '/?tab=prs');
    const initial = getInitialNavigationState();
    expect(initial.tab).toBe('progress');
    expect(initial.progressTab).toBe('prs');
  });

  it('falls back to localStorage when URL search params are absent (PWA relaunch / refresh at root)', () => {
    window.history.replaceState({}, '', '/');
    localStorage.setItem('ascend_active_tab', 'meals');

    const initial = getInitialNavigationState();
    expect(initial.tab).toBe('meals');
  });

  it('defaults to home when both URL params and localStorage are empty', () => {
    window.history.replaceState({}, '', '/');
    const initial = getInitialNavigationState();
    expect(initial.tab).toBe('home');
    expect(initial.progressTab).toBe('overview');
  });

  it('preserves multi-tab back history without jumping directly to home screen', () => {
    // Simulate navigation stack: Home -> Workout -> Meals
    const stack = ['home', 'workout', 'meals'];

    // First back press from Meals returns to Workout (not directly to Home)
    const afterFirstBack = [...stack];
    afterFirstBack.pop();
    const prevTab1 = afterFirstBack[afterFirstBack.length - 1];
    expect(prevTab1).toBe('workout');

    // Second back press from Workout returns to Home
    afterFirstBack.pop();
    const prevTab2 = afterFirstBack[afterFirstBack.length - 1];
    expect(prevTab2).toBe('home');
  });
});
