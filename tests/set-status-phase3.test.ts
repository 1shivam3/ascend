/**
 * Phase 3.4 (§17): set execution status — ONE stored field.
 *
 * Before: three encodings (explicit status, completed boolean,
 * reps>0 inference) and three separate precedence implementations
 * that could disagree. After: one precedence implementation in
 * types.ts (the two boolean helpers delegate), persisted history is
 * canonicalized to `status` only (completed boolean stripped,
 * 'pending' never persists), and new history is born canonical in
 * finalizeWorkoutSet.
 *
 * The equivalence sweep pins the resolvers against verbatim copies
 * of the OLD implementations over the full encoding space — the
 * refactor must not change any resolution.
 */
import { describe, it, expect } from 'vitest';
import {
  getSetExecutionStatus,
  isSetCompleted,
  isActiveSetCompleted,
  normalizePersistedWorkoutSet,
  type SetExecutionStatus,
  type WorkoutSet,
} from '../src/lib/types';
import { finalizeWorkoutSet } from '../src/lib/workout-engine';
import { migratePersistedState } from '../src/lib/store';
import { legacySetEncodings } from './fixtures/persisted/legacy-shapes';

// ── OLD implementations, copied verbatim as the oracle ──────────────
function oldGetStatus(set: WorkoutSet): SetExecutionStatus {
  if (set?.status) return set.status;
  if (set?.completed === true) return 'completed';
  if (set?.completed === false) return set.reps && set.reps > 0 ? 'pending' : 'not_attempted';
  return set?.reps && set.reps > 0 ? 'completed' : 'not_attempted';
}
function oldIsCompleted(set: WorkoutSet): boolean {
  if (set?.status) return set.status === 'completed';
  if (typeof set?.completed === 'boolean') return set.completed;
  return Boolean(set?.reps && set.reps > 0);
}
function oldIsActiveCompleted(set: WorkoutSet): boolean {
  if (set?.status) return set.status === 'completed';
  return set?.completed === true;
}

const STATUSES: (SetExecutionStatus | undefined)[] = [
  undefined,
  'pending',
  'completed',
  'skipped',
  'not_attempted',
];
const COMPLETEDS: (boolean | undefined)[] = [undefined, true, false];
const REPSES = [0, 5];

describe('resolver equivalence with the pre-3.4 implementations', () => {
  it('all three resolvers agree with the old ones on every encoding combination', () => {
    for (const status of STATUSES) {
      for (const completed of COMPLETEDS) {
        for (const reps of REPSES) {
          const set: WorkoutSet = { reps, unit: 'kg', status, completed };
          const label = JSON.stringify({ status, completed, reps });
          expect(getSetExecutionStatus(set), label).toBe(oldGetStatus(set));
          expect(isSetCompleted(set), label).toBe(oldIsCompleted(set));
          expect(isActiveSetCompleted(set), label).toBe(oldIsActiveCompleted(set));
        }
      }
    }
  });
});

describe('normalizePersistedWorkoutSet', () => {
  it('maps every legacy combination to one status and strips the boolean', () => {
    // status wins over a conflicting boolean (the old precedence)
    expect(normalizePersistedWorkoutSet({ reps: 5, unit: 'kg', status: 'skipped', completed: true }))
      .toEqual({ reps: 5, unit: 'kg', status: 'skipped' });
    expect(normalizePersistedWorkoutSet({ reps: 5, unit: 'kg', completed: true }))
      .toEqual({ reps: 5, unit: 'kg', status: 'completed' });
    expect(normalizePersistedWorkoutSet({ reps: 8, unit: 'kg' }))
      .toEqual({ reps: 8, unit: 'kg', status: 'completed' });
    expect(normalizePersistedWorkoutSet({ reps: 0, unit: 'kg' }))
      .toEqual({ reps: 0, unit: 'kg', status: 'not_attempted' });
  });

  it("'pending' never persists: an entered-but-unfinished set becomes not_attempted, reps kept", () => {
    expect(normalizePersistedWorkoutSet({ reps: 5, unit: 'kg', completed: false }))
      .toEqual({ reps: 5, unit: 'kg', status: 'not_attempted' });
    expect(normalizePersistedWorkoutSet({ reps: 5, unit: 'kg', status: 'pending' }))
      .toEqual({ reps: 5, unit: 'kg', status: 'not_attempted' });
  });

  it('is idempotent and preserves the other fields', () => {
    const once = normalizePersistedWorkoutSet({
      reps: 5, unit: 'kg', weight: 100, completed: true, isWarmup: true, rpe: 8,
    });
    expect(normalizePersistedWorkoutSet(once)).toEqual(once);
    expect(once).toMatchObject({ weight: 100, isWarmup: true, rpe: 8 });
  });
});

describe('finalizeWorkoutSet is born canonical', () => {
  it('writes status only — no completed boolean', () => {
    const done = finalizeWorkoutSet({ reps: 5, weight: 100, unit: 'kg', completed: true });
    expect(done.status).toBe('completed');
    expect('completed' in done).toBe(false);
    const skipped = finalizeWorkoutSet({ reps: 0, unit: 'kg', status: 'skipped' });
    expect(skipped.status).toBe('skipped');
    expect('completed' in skipped).toBe(false);
    const untouched = finalizeWorkoutSet({ reps: 0, unit: 'kg' });
    expect(untouched.status).toBe('not_attempted');
    expect('completed' in untouched).toBe(false);
  });
});

describe('persist migration canonicalizes legacy history (old-shape fixture)', () => {
  it('the pre-§17 fixture resolves identically after migration, in canonical shape', () => {
    const envelope = JSON.parse(legacySetEncodings.entries['ascend_store']);
    const persisted = envelope.state;
    const before: WorkoutSet[] = persisted.workouts[0].exercises[0].sets;
    const completedBefore = before.map((s) => isSetCompleted(s));

    const migrated = migratePersistedState(persisted, 1) as any;
    const after: WorkoutSet[] = migrated.workouts[0].exercises[0].sets;

    expect(after.map((s) => s.status)).toEqual(['completed', 'not_attempted', 'completed']);
    expect(after.every((s) => !('completed' in s))).toBe(true);
    // Completion — the fact every reader depends on — is identical
    // for every set. (The middle set resolved 'pending' under the
    // legacy encoding; 'pending' never persists after §17, so it is
    // stored 'not_attempted' — unfinished either way.)
    expect(after.map((s) => isSetCompleted(s))).toEqual(completedBefore);
    // No data lost: reps/weights untouched.
    expect(after.map((s) => [s.reps, s.weight])).toEqual(before.map((s) => [s.reps, s.weight]));
  });
});
