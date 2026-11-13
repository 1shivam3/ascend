/**
 * §3 / Phase 1.5 — the logged-out latch has ONE owner module.
 *
 * Two kinds of evidence:
 * 1. Module contract: exact-'true' semantics (the pre-module read sites
 *    all compared against the literal 'true'), best-effort failure
 *    behavior (a throwing storage must not break logout/sign-in).
 * 2. Source guard: the raw key literal may exist ONLY in the owner
 *    module — every other file must go through it. This guard fails on
 *    the pre-module tree (~19 direct localStorage touchpoints across
 *    sync.ts, store.ts, Onboarding, DeleteAccountView, storage.ts).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  LOGGED_OUT_LATCH_KEY,
  clearLoggedOutLatch,
  isLoggedOutLatchSet,
  markLoggedOut,
} from '@/lib/logged-out-latch';
import { installMemoryStorage } from './helpers/persisted-fixtures';

(globalThis as { window?: unknown }).window = globalThis;
const storage = installMemoryStorage();

beforeEach(() => {
  storage.clear();
  (globalThis as { localStorage?: Storage }).localStorage = storage;
});

describe('§3 logged-out latch module', () => {
  it('set → read true; clear → read false', () => {
    expect(isLoggedOutLatchSet()).toBe(false);
    markLoggedOut();
    expect(isLoggedOutLatchSet()).toBe(true);
    expect(storage.getItem(LOGGED_OUT_LATCH_KEY)).toBe('true');
    clearLoggedOutLatch();
    expect(isLoggedOutLatchSet()).toBe(false);
  });

  it("only the exact string 'true' counts as set (legacy semantics)", () => {
    storage.setItem(LOGGED_OUT_LATCH_KEY, 'yes');
    expect(isLoggedOutLatchSet()).toBe(false);
    storage.setItem(LOGGED_OUT_LATCH_KEY, '1');
    expect(isLoggedOutLatchSet()).toBe(false);
  });

  it('a throwing storage never propagates and reads as not-set', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    (globalThis as { localStorage?: Storage }).localStorage = throwing;
    expect(() => markLoggedOut()).not.toThrow();
    expect(() => clearLoggedOutLatch()).not.toThrow();
    expect(isLoggedOutLatchSet()).toBe(false);
  });
});

describe('§3 single-owner source guard', () => {
  it("the literal 'ascend_logged_out' appears only in the owner module", () => {
    const srcRoot = join(process.cwd(), 'src');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          walk(path);
        } else if (/\.(ts|tsx)$/.test(entry)) {
          const text = readFileSync(path, 'utf8');
          if (text.includes("'ascend_logged_out'") || text.includes('"ascend_logged_out"')) {
            offenders.push(path.replace(`${process.cwd()}/`, ''));
          }
        }
      }
    };
    walk(srcRoot);
    expect(offenders).toEqual(['src/lib/logged-out-latch.ts']);
  });
});
