import { describe, it, expect, vi, beforeEach } from 'vitest';
import { seedInitialBrowserHistory } from '@/lib/navigation';

/**
 * Fresh-tab deep-link Back fix (see seedInitialBrowserHistory).
 *
 * The in-app stack for a deep-linked first mount is ['home', tab]
 * (length 2), so goBack() calls window.history.back(). Before the fix
 * the mount effect only replaceState()d the single fresh-tab entry,
 * so Back had no previous browser entry and exited the app. The fix
 * seeds [home, tab] in the browser too, so Back pops to home in-app.
 *
 * These tests model a real browser session history: replaceState
 * rewrites the current entry, pushState appends one, back() pops to
 * the previous entry when one exists and otherwise does nothing
 * (a fresh tab has no previous entry — which is exactly how Back
 * used to escape the app).
 */

interface HistoryEntry {
  state: unknown;
  url: string;
}

class MockHistory {
  entries: HistoryEntry[];
  replaceState = vi.fn((state: unknown, _title: string, url?: string) => {
    this.entries[this.entries.length - 1] = {
      state,
      url: url ?? this.entries[this.entries.length - 1].url,
    };
    this.syncLocation();
  });
  pushState = vi.fn((state: unknown, _title: string, url?: string) => {
    this.entries.push({ state, url: url ?? this.entries[this.entries.length - 1].url });
    this.syncLocation();
  });
  back = vi.fn(() => {
    if (this.entries.length > 1) {
      this.entries.pop();
      this.syncLocation();
    }
    // Length 1: no previous entry — the browser leaves the page
    // (new-tab page / previous site); nothing in-app to land on.
  });

  constructor(initialUrl: string) {
    this.entries = [{ state: null, url: initialUrl }];
  }

  private syncLocation(): void {
    const top = this.entries[this.entries.length - 1];
    const parsed = new URL(top.url, 'https://ascendtonext.vercel.app');
    const loc = (globalThis as any).window.location;
    loc.href = parsed.href;
    loc.pathname = parsed.pathname;
    loc.search = parsed.search;
    loc.hash = parsed.hash;
  }
}

function setupWindow(initialUrl: string): MockHistory {
  const history = new MockHistory(initialUrl);
  const parsed = new URL(initialUrl, 'https://ascendtonext.vercel.app');
  (globalThis as any).window = {
    location: {
      href: parsed.href,
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
    },
    history,
  };
  return history;
}

describe('seedInitialBrowserHistory', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('home initial tab: single replaceState, no extra entry (double-back path untouched)', () => {
    const history = setupWindow('/');
    seedInitialBrowserHistory('home', 'overview');

    expect(history.replaceState).toHaveBeenCalledTimes(1);
    expect(history.replaceState).toHaveBeenCalledWith(
      { tab: 'home', root: true, stackDepth: 1 },
      '',
      '/'
    );
    expect(history.pushState).not.toHaveBeenCalled();
    expect(history.entries).toHaveLength(1);
  });

  it('deep-linked settings tab: seeds [home, settings] in that order', () => {
    const history = setupWindow('/?tab=settings');
    seedInitialBrowserHistory('settings', 'overview');

    expect(history.replaceState).toHaveBeenCalledTimes(1);
    expect(history.replaceState).toHaveBeenCalledWith(
      { tab: 'home', root: true, stackDepth: 1 },
      '',
      '/'
    );
    expect(history.pushState).toHaveBeenCalledTimes(1);
    expect(history.pushState).toHaveBeenCalledWith(
      { tab: 'settings', root: false, stackDepth: 2 },
      '',
      '/?tab=settings'
    );
    expect(history.entries.map((e) => e.url)).toEqual(['/', '/?tab=settings']);
    expect(history.entries[1].state).toEqual({ tab: 'settings', root: false, stackDepth: 2 });
  });

  it('deep-linked progress sub-tab keeps its sub param on the pushed entry', () => {
    const history = setupWindow('/?tab=progress&sub=strength');
    seedInitialBrowserHistory('progress', 'strength');

    expect(history.entries.map((e) => e.url)).toEqual(['/', '/?tab=progress&sub=strength']);
    expect(history.entries[1].state).toEqual({ tab: 'progress', root: false, stackDepth: 2 });
  });

  it('Back from a fresh deep link lands on the home entry instead of exiting', () => {
    const history = setupWindow('/?tab=settings');
    seedInitialBrowserHistory('settings', 'overview');

    // The app's Back control calls history.back() (stack length 2).
    history.back();
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0].url).toBe('/');
    expect(history.entries[0].state).toEqual({ tab: 'home', root: true, stackDepth: 1 });
  });

  it('Back from a fresh home tab has no previous entry (existing double-back behavior)', () => {
    const history = setupWindow('/');
    seedInitialBrowserHistory('home', 'overview');

    history.back();
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0].url).toBe('/');
  });

  it('no-ops without a window (SSR) instead of throwing', () => {
    delete (globalThis as any).window;
    expect(() => seedInitialBrowserHistory('settings', 'overview')).not.toThrow();
  });
});
