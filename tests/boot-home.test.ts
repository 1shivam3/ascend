import { describe, expect, it } from 'vitest';
import { consumeBootSessionFlag, decideBootTab, hasBootSessionFlag, BOOT_SESSION_KEY } from '../src/lib/boot-home';

function fakeStorage(): { store: Record<string, string>; getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const store: Record<string, string> = {};
  return {
    store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = v;
    },
  };
}

describe('consumeBootSessionFlag', () => {
  it('fresh session: absent flag reads fresh and sets the flag', () => {
    const storage = fakeStorage();
    expect(consumeBootSessionFlag(storage)).toBe(true);
    expect(storage.store[BOOT_SESSION_KEY]).toBe('1');
  });

  it('continuing session: present flag reads not-fresh', () => {
    const storage = fakeStorage();
    expect(consumeBootSessionFlag(storage)).toBe(true);
    expect(consumeBootSessionFlag(storage)).toBe(false);
  });

  it('missing storage fails safe to fresh (Home)', () => {
    expect(consumeBootSessionFlag(undefined)).toBe(true);
    expect(consumeBootSessionFlag(null)).toBe(true);
  });

  it('throwing storage fails safe to fresh (Home)', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(consumeBootSessionFlag(throwing)).toBe(true);
  });
});

describe('hasBootSessionFlag — read-only session check', () => {
  it('absent flag reads not-started', () => {
    expect(hasBootSessionFlag(fakeStorage())).toBe(false);
  });

  it('present flag reads started', () => {
    const storage = fakeStorage();
    storage.setItem(BOOT_SESSION_KEY, '1');
    expect(hasBootSessionFlag(storage)).toBe(true);
  });

  it('missing or throwing storage reads not-started (fresh)', () => {
    expect(hasBootSessionFlag(undefined)).toBe(false);
    expect(hasBootSessionFlag(null)).toBe(false);
    expect(
      hasBootSessionFlag({
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {},
      }),
    ).toBe(false);
  });
});

describe('decideBootTab — the boot decision table', () => {
  const saved = { tab: 'meals' as const, progressTab: 'overview' as const };

  it('explicit URL tab wins, even on a fresh launch (deep link / refresh)', () => {
    expect(
      decideBootTab({ urlTab: 'meals', saved, freshLaunch: true }),
    ).toEqual({ tab: 'meals', progressTab: 'overview' });
  });

  it('fresh launch with a bare URL goes Home, ignoring the saved tab', () => {
    expect(decideBootTab({ urlTab: null, saved, freshLaunch: true })).toEqual({
      tab: 'home',
      progressTab: 'overview',
    });
  });

  it('continuing session restores the saved tab', () => {
    expect(decideBootTab({ urlTab: null, saved, freshLaunch: false })).toEqual(saved);
  });

  it('continuing session with nothing saved goes Home', () => {
    expect(decideBootTab({ urlTab: null, saved: null, freshLaunch: false })).toEqual({
      tab: 'home',
      progressTab: 'overview',
    });
  });

  it('progress URL sub-tab is honored for the progress tab', () => {
    expect(
      decideBootTab({ urlTab: 'progress', urlProgressTab: 'prs', saved: null, freshLaunch: false }),
    ).toEqual({ tab: 'progress', progressTab: 'prs' });
  });
});
