import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolvePullWinner,
  shouldPushRow,
  resolveDeleteVsEdit,
  recomputePullSlices,
  type PullSliceKey,
} from '@/lib/supabase/reconcile';
import {
  recordSyncConflicts,
  readSyncConflicts,
  SYNC_CONFLICTS_KEY,
} from '@/lib/supabase/sync';

/**
 * Phase 2.2 (§9) — ONE conflict rule for both directions.
 *
 * Before: resolvePullWinner (pull) and shouldPushRow (push) shared
 * the tie rule but diverged on missing stamps — when the local
 * stamp parsed and the remote stamp was missing (or both were
 * missing), pull kept local while push refused to upload it, so
 * the local winner could never reach the server and devices
 * diverged permanently on legacy stamp-less rows.
 *
 * After: shouldPushRow IS resolvePullWinner, gated on the row
 * existing remotely. An unparseable stamp is a missing stamp, on
 * both sides, everywhere. The one deliberate exception that stays:
 * isLocalProfileNewer (the profile stale-update race guard) keeps
 * its stricter both-must-parse rule — it guards a race, not a merge.
 *
 * And lost edits leave a trace: the pull records each discarded
 * local row (id + stamps) in the local conflict log.
 */

const OLD = '2026-11-01T10:00:00.000Z';
const NEW = '2026-11-10T10:00:00.000Z';

class MockStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}
const storage = new MockStorage();
(globalThis as any).localStorage = storage;
(globalThis as any).window = globalThis;

describe('§9 the unified edit-vs-edit rule', () => {
  const cases: Array<[string | null, string | null, boolean]> = [
    // [local, remote, expected shouldPushRow]
    [NEW, OLD, true], // strictly newer local pushes
    [OLD, NEW, false], // remote newer: remote wins
    [NEW, NEW, false], // tie: remote wins (both directions)
    [null, NEW, false], // local missing, remote parses: remote wins
    [NEW, null, true], // remote missing, local parses: local wins — CHANGED (was false)
    [null, null, true], // both missing: local wins — CHANGED (was false)
    ['garbage', NEW, false], // unparseable local = missing local
    [NEW, 'garbage', true], // unparseable remote = missing remote — CHANGED
  ];

  it.each(cases)('local=%s remote=%s -> push %s', (local, remote, expected) => {
    expect(shouldPushRow(local, remote)).toBe(expected);
    // The invariant: push agrees with pull's winner, always.
    expect(shouldPushRow(local, remote)).toBe(
      resolvePullWinner(local, remote) === 'local',
    );
  });

  it('a row absent remotely always pushes', () => {
    expect(shouldPushRow(null, undefined)).toBe(true);
    expect(shouldPushRow(NEW, undefined)).toBe(true);
  });
});

describe('§9 delete-vs-edit table (already one function, both directions)', () => {
  it.each([
    [NEW, OLD, 'delete'], // deletion newer than the edit
    [OLD, NEW, 'keep'], // edit newer than the deletion resurrects
    [NEW, NEW, 'delete'], // tie goes to delete (convergence)
    [null, OLD, 'keep'], // unstamped (legacy) tombstone + parseable row: keep
    [NEW, null, 'delete'], // row stamp missing: cannot prove newer -> delete
    [null, null, 'delete'], // neither parses: delete (row cannot prove newer)
  ] as Array<[string | null, string | null, string]>)(
    'deletedAt=%s rowStamp=%s -> %s',
    (deletedAt, rowStamp, expected) => {
      expect(resolveDeleteVsEdit(deletedAt, rowStamp)).toBe(expected);
    },
  );
});

describe('§9 the conflict record', () => {
  const slice = (rows: any[]) => ({ local: rows, tombstones: [] as string[] });
  const freshAll = (workouts: any) => ({
    prs: slice([]),
    workouts,
    meals: slice([]),
    bodyMetrics: slice([]),
    plannedWorkouts: slice([]),
  }) as Record<PullSliceKey, { local: any[]; tombstones: Iterable<string> }>;

  it('a local row replaced by a newer remote row is recorded with both stamps', () => {
    const conflicts: any[] = [];
    recomputePullSlices(
      freshAll(slice([{ id: 'w1', title: 'Local', updatedAt: OLD }])),
      { workouts: [{ id: 'w1', title: 'Remote', updatedAt: NEW }] as any },
      false,
      false,
      undefined,
      (c) => conflicts.push(c),
    );
    expect(conflicts).toEqual([
      { slice: 'workouts', id: 'w1', loser: 'local', loserStamp: OLD, winnerStamp: NEW },
    ]);
  });

  it('identical content with different stamps is NOT a conflict (nothing was lost)', () => {
    const conflicts: any[] = [];
    recomputePullSlices(
      freshAll(slice([{ id: 'w1', title: 'Same', updatedAt: OLD }])),
      { workouts: [{ id: 'w1', title: 'Same', updatedAt: NEW }] as any },
      false,
      false,
      undefined,
      (c) => conflicts.push(c),
    );
    expect(conflicts).toEqual([]);
  });

  it('the local winner discards nothing at pull time (no record)', () => {
    const conflicts: any[] = [];
    recomputePullSlices(
      freshAll(slice([{ id: 'w1', title: 'Local newer', updatedAt: NEW }])),
      { workouts: [{ id: 'w1', title: 'Remote older', updatedAt: OLD }] as any },
      false,
      false,
      undefined,
      (c) => conflicts.push(c),
    );
    expect(conflicts).toEqual([]);
  });
});

describe('§9 the persisted conflict log', () => {
  beforeEach(() => storage.clear());

  it('round-trips and caps at the newest 50', () => {
    const entries = Array.from({ length: 60 }, (_, i) => ({
      slice: 'workouts',
      id: `w${i}`,
      loser: 'local' as const,
      loserStamp: OLD,
      winnerStamp: NEW,
    }));
    recordSyncConflicts(entries);
    const read = readSyncConflicts();
    expect(read).toHaveLength(50);
    expect(read[0].id).toBe('w10');
    expect(read[49].id).toBe('w59');
    expect(typeof read[0].at).toBe('string');
  });

  it('a corrupt log reads as empty and self-heals on the next write', () => {
    storage.setItem(SYNC_CONFLICTS_KEY, '{not json');
    expect(readSyncConflicts()).toEqual([]);
    recordSyncConflicts([
      { slice: 'meals', id: 'm1', loser: 'local', loserStamp: null, winnerStamp: NEW },
    ]);
    expect(readSyncConflicts().map((c) => c.id)).toEqual(['m1']);
  });
});
