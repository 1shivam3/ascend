/**
 * Task 2.4 — guest backup nudges, last-backup tracking, and the
 * persistent-storage request.
 *
 * Behavior is pinned at the pure/lib level (decideBackupNudge is the
 * whole milestone policy); the component is pinned by source checks
 * for its wiring (Today mount, AuthModal, real export path), the
 * same split other tasks in this branch use.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  decideBackupNudge,
  firstWorkoutTimestamp,
  getBackupNudgeSeen,
  getLastBackupAt,
  markBackupNudgeShown,
  recordBackupExported,
  requestPersistentStorage,
  BACKUP_NUDGE_STATE_KEY,
  LAST_BACKUP_AT_KEY,
} from '../src/lib/backup-nudge';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-10-01T00:00:00').getTime(); // first workout
const NOW = T0 + 10 * DAY;

let backing: Map<string, string>;

beforeEach(() => {
  backing = new Map();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (backing.has(k) ? backing.get(k)! : null),
    setItem: (k: string, v: string) => void backing.set(k, String(v)),
    removeItem: (k: string) => void backing.delete(k),
  };
});

afterEach(() => {
  delete (globalThis as any).localStorage;
  vi.unstubAllGlobals();
});

const base = {
  isGuest: true,
  workoutCount: 1,
  firstWorkoutTs: T0,
  lastBackupAt: null as number | null,
  seen: {},
  now: NOW,
};

describe('decideBackupNudge', () => {
  it('shows the first-workout nudge to a guest with one workout', () => {
    expect(decideBackupNudge(base)).toBe('first-workout');
  });

  it('never nudges signed-in users, empty histories, or missing dates', () => {
    expect(decideBackupNudge({ ...base, isGuest: false })).toBeNull();
    expect(decideBackupNudge({ ...base, workoutCount: 0 })).toBeNull();
    expect(decideBackupNudge({ ...base, firstWorkoutTs: null })).toBeNull();
  });

  it('a backup after the first workout suppresses the first nudge', () => {
    expect(decideBackupNudge({ ...base, lastBackupAt: T0 + DAY })).toBeNull();
    // …but a backup from BEFORE the first workout does not.
    expect(decideBackupNudge({ ...base, lastBackupAt: T0 - DAY })).toBe('first-workout');
  });

  it('shows milestone 1 once: after it is seen, nothing until established', () => {
    // Seen, 1 workout, only 2 days in → neither milestone is due.
    expect(decideBackupNudge({ ...base, seen: { first: T0 }, now: T0 + 2 * DAY })).toBeNull();
  });

  it('established fires at 10 workouts once milestone 1 was seen', () => {
    expect(
      decideBackupNudge({ ...base, seen: { first: T0 }, workoutCount: 10, now: T0 + DAY })
    ).toBe('established');
  });

  it('established fires at 7 days since the first workout', () => {
    expect(
      decideBackupNudge({ ...base, seen: { first: T0 }, workoutCount: 3, now: T0 + 7 * DAY })
    ).toBe('established');
    expect(
      decideBackupNudge({ ...base, seen: { first: T0 }, workoutCount: 3, now: T0 + 6 * DAY })
    ).toBeNull();
  });

  it('a backup after milestone 1 suppresses the established nudge', () => {
    expect(
      decideBackupNudge({
        ...base,
        seen: { first: T0 },
        workoutCount: 12,
        lastBackupAt: T0 + 2 * DAY,
      })
    ).toBeNull();
  });

  it('nothing shows after both milestones were seen', () => {
    expect(
      decideBackupNudge({
        ...base,
        seen: { first: T0, established: T0 + 8 * DAY },
        workoutCount: 40,
      })
    ).toBeNull();
  });
});

describe('last-backup + seen-state storage', () => {
  it('round-trips the backup timestamp and tolerates garbage', () => {
    expect(getLastBackupAt()).toBeNull();
    recordBackupExported(1234567890);
    expect(backing.get(LAST_BACKUP_AT_KEY)).toBe('1234567890');
    expect(getLastBackupAt()).toBe(1234567890);
    backing.set(LAST_BACKUP_AT_KEY, 'not-a-number');
    expect(getLastBackupAt()).toBeNull();
  });

  it('round-trips milestone seen-state per milestone', () => {
    expect(getBackupNudgeSeen()).toEqual({});
    markBackupNudgeShown('first-workout', 111);
    expect(getBackupNudgeSeen()).toEqual({ first: 111 });
    markBackupNudgeShown('established', 222);
    expect(getBackupNudgeSeen()).toEqual({ first: 111, established: 222 });
    expect(backing.has(BACKUP_NUDGE_STATE_KEY)).toBe(true);
  });
});

describe('firstWorkoutTimestamp', () => {
  it('returns the earliest local-midnight timestamp, skipping junk', () => {
    expect(
      firstWorkoutTimestamp([
        { date: '2026-10-05' },
        { date: '2026-10-01' },
        { date: 'garbage' },
        { date: null },
        {},
      ])
    ).toBe(T0);
    expect(firstWorkoutTimestamp([])).toBeNull();
  });
});

describe('requestPersistentStorage', () => {
  it('reports unsupported without navigator.storage', async () => {
    vi.stubGlobal('navigator', {});
    await expect(requestPersistentStorage()).resolves.toBe('unsupported');
  });

  it('short-circuits when storage is already persistent', async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', {
      storage: { persisted: async () => true, persist },
    });
    await expect(requestPersistentStorage()).resolves.toBe('persisted');
    expect(persist).not.toHaveBeenCalled();
  });

  it('maps persist() outcomes and never throws', async () => {
    vi.stubGlobal('navigator', {
      storage: { persisted: async () => false, persist: async () => true },
    });
    await expect(requestPersistentStorage()).resolves.toBe('granted');
    vi.stubGlobal('navigator', {
      storage: {
        persisted: async () => false,
        persist: async () => {
          throw new Error('nope');
        },
      },
    });
    await expect(requestPersistentStorage()).resolves.toBe('denied');
  });
});

describe('wiring (source pins)', () => {
  const read = (rel: string) =>
    fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

  it('Today mounts the nudge and page.tsx requests persistent storage', () => {
    expect(read('src/components/HomePage.tsx')).toContain('<BackupNudge />');
    expect(read('src/app/page.tsx')).toContain('requestPersistentStorage()');
  });

  it('the nudge uses the real export path, records it, and mounts AuthModal', () => {
    const src = read('src/components/BackupNudge.tsx');
    expect(src).toContain('decideBackupNudge');
    expect(src).toContain('exportFullBackupJSON()');
    expect(src).toContain('recordBackupExported()');
    expect(src).toContain('<AuthModal');
    expect(src).toContain('markBackupNudgeShown');
  });

  it('both existing export paths record the backup; the vault shows the date', () => {
    expect(read('src/components/SettingsView.tsx')).toContain('recordBackupExported()');
    const vault = read('src/components/DataVaultModal.tsx');
    expect(vault).toContain('recordBackupExported()');
    expect(vault).toContain("t('vault.lastBackup'");
    expect(vault).toContain("t('vault.noBackupYet')");
  });

  it('all new strings exist in en + hi', () => {
    const en = read('src/lib/i18n/en.ts');
    const hi = read('src/lib/i18n/hi.ts');
    for (const key of [
      'backupNudge.title',
      'backupNudge.bodyFirst',
      'backupNudge.bodyEstablished',
      'vault.lastBackup',
      'vault.noBackupYet',
    ]) {
      expect(en).toContain(`'${key}'`);
      expect(hi).toContain(`'${key}'`);
    }
  });

  it('the storage-full warning path is intact (persist failure → vault warning)', () => {
    // store.ts sets the flag in the persist write path…
    const store = read('src/lib/store.ts');
    expect(store).toContain('mainStoreWriteFailed = true');
    expect(store).toContain('export function getStorageWriteFailed()');
    // …and DataVaultModal renders it.
    expect(read('src/components/DataVaultModal.tsx')).toContain('getStorageWriteFailed()');
  });
});
