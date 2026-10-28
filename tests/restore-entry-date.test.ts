import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../src/lib/store';
import { importFullBackupJSON } from '../src/lib/storage';
import { getLocalTodayStr } from '../src/lib/formatters';

/**
 * Preview-fix F12a: restore must not bypass the entry-date rule.
 * importAllData (DataVault + Settings JSON restore) and
 * importFullBackupJSON (Onboarding + Settings direct-blob restore)
 * used to merge bodyMetrics verbatim, so a backup carrying
 * future/malformed dates restored them past both the modal's native
 * validation and the store's updateBodyMetrics fallback. Invalid
 * dates now fall back to today; valid dates pass unchanged — the
 * same rule as entry.
 */

const BAD_METRICS = [
  { id: 'm_future', date: '2999-01-01', weightKg: 80 },
  { id: 'm_bad', date: '2026-02-30', weightKg: 81 },
  { id: 'm_garbage', date: 'not-a-date', weightKg: 82 },
  { id: 'm_ok', date: '2026-10-01', weightKg: 83 },
];

describe('F12a: restore normalizes body-metric dates', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  it('importAllData falls back invalid dates to today', () => {
    const ok = useStore.getState().importAllData({ bodyMetrics: BAD_METRICS });
    expect(ok).toBe(true);
    const entries = useStore.getState().bodyMetrics;
    expect(entries).toHaveLength(4);
    const byId = new Map(entries.map((e: any) => [e.id, e.date]));
    const today = getLocalTodayStr();
    expect(byId.get('m_future')).toBe(today);
    expect(byId.get('m_bad')).toBe(today);
    expect(byId.get('m_garbage')).toBe(today);
    expect(byId.get('m_ok')).toBe('2026-10-01');
  });

  it('importFullBackupJSON falls back invalid dates to today', () => {
    // The suite runs in a node environment (no window), while this
    // function early-returns without one — so stub a minimal window
    // with a Map-backed localStorage for this call only. The function
    // under test touches window.localStorage and nothing else.
    const backing = new Map<string, string>();
    const stubStorage = {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => {
        backing.set(k, v);
      },
      removeItem: (k: string) => {
        backing.delete(k);
      },
      clear: () => {
        backing.clear();
      },
      get length() {
        return backing.size;
      },
      key: (i: number) => [...backing.keys()][i] ?? null,
    };
    (globalThis as any).window = { localStorage: stubStorage };
    const payload = JSON.stringify({
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      source: 'test',
      bodyMetrics: BAD_METRICS,
    });
    expect(importFullBackupJSON(payload)).toBe(true);
    const raw = stubStorage.getItem('ascend_store');
    expect(raw).not.toBeNull();
    const blob = JSON.parse(raw as string);
    const entries = blob.state.bodyMetrics as Array<{ id: string; date: string }>;
    const byId = new Map(entries.map((e) => [e.id, e.date]));
    const today = getLocalTodayStr();
    expect(byId.get('m_future')).toBe(today);
    expect(byId.get('m_bad')).toBe(today);
    expect(byId.get('m_garbage')).toBe(today);
    expect(byId.get('m_ok')).toBe('2026-10-01');
  });
});
