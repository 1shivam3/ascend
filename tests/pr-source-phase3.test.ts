/**
 * Phase 3.1 (§23): PRs have ONE source of truth — derived records
 * recomputed from workout history plus user-owned manual records.
 *
 * Before: derived records were reconciled on workout DELETE and its
 * Undo, but a set-level edit through the store left stale PRs
 * standing (the WorkoutPage editor carried its own planner; every
 * other path skipped reconciliation). `WorkoutSet.isPR` was never
 * written yet read by four surfaces, each with its own fallback.
 * Baselines were encoded twice (an isBaseline flag nobody wrote +
 * the notes text).
 *
 * After: updateWorkout reconciles like delete does; PR-ness at read
 * time comes from computeSessionPRMarks (the same replay that
 * reconciles the records); baselines are the flag, written at mint
 * time and backfilled by the persist migration.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, migratePersistedState } from '../src/lib/store';
import {
  computeSessionPRMarks,
  isPRSet,
} from '../src/lib/pr-reevaluation';
import { isBaselinePR } from '../src/lib/weekly-recap';
import type { PersonalRecord, WorkoutEntry, WorkoutSet } from '../src/lib/types';

const mkSet = (over: Partial<WorkoutSet> = {}): WorkoutSet => ({
  reps: 5,
  weight: 100,
  unit: 'kg',
  status: 'completed',
  ...over,
});

const mkWorkout = (id: string, date: string, sets: WorkoutSet[]): WorkoutEntry => ({
  id,
  date,
  name: 'Upper A',
  exercises: [{ name: 'Bench Press', sets }],
});

// W1 2026-10-26: 100×5 → e1RM 116.7 (baseline). W2 2026-11-02: 110×5 → 128.3.
const W1 = mkWorkout('wk1', '2026-10-26', [mkSet({ weight: 100 })]);
const W2 = mkWorkout('wk2', '2026-11-02', [mkSet({ weight: 110 })]);

const PR_BASE: PersonalRecord = {
  id: 'pr-base', exercise: 'Bench Press', weightKg: 100, weightLbs: 220.5,
  reps: 5, oneRepMax: 116.7, date: '2026-10-26',
  notes: 'Baseline established from first session', prType: '1rm',
};
const PR_TOP: PersonalRecord = {
  id: 'pr-top', exercise: 'Bench Press', weightKg: 110, weightLbs: 242.5,
  reps: 5, oneRepMax: 128.3, date: '2026-11-02',
  notes: 'All-Time 1RM PR', prType: '1rm',
};
const PR_MANUAL: PersonalRecord = {
  id: 'pr-manual', exercise: 'Bench Press', weightKg: 120, weightLbs: 264.6,
  reps: 3, oneRepMax: 132, date: '2026-11-03', notes: 'Tested at the gym meet',
};

const benchPRs = () =>
  useStore.getState().prs.filter((p) => p.exercise === 'Bench Press');

describe('computeSessionPRMarks / isPRSet — read-time PR truth', () => {
  it('first-ever lift: the top set is a PR set (baseline)', () => {
    const marks = computeSessionPRMarks([W1], [], 75);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ workoutId: 'wk1', kind: '1rm', weightKg: 100, reps: 5 });
    expect(isPRSet(marks, 'wk1', 'Bench Press', W1.exercises[0].sets[0])).toBe(true);
  });

  it('matching a PR is not a PR; beating it is', () => {
    const same = mkWorkout('wk2', '2026-11-02', [mkSet({ weight: 100 })]);
    expect(computeSessionPRMarks([W1, same], [], 75)).toHaveLength(1);
    const marks = computeSessionPRMarks([W1, W2], [], 75);
    expect(marks.map((m) => m.workoutId)).toEqual(['wk1', 'wk2']);
    expect(isPRSet(marks, 'wk2', 'Bench Press', W2.exercises[0].sets[0])).toBe(true);
    expect(isPRSet(marks, 'wk1', 'Bench Press', W2.exercises[0].sets[0])).toBe(false);
  });

  it('a user-owned record raises the bar (it is part of the one source)', () => {
    const owned: PersonalRecord = { ...PR_MANUAL, id: 'pr-owned', date: '2026-10-20' };
    // 116.7 and 128.3 both lose to the owned 132 — no marks at all.
    expect(computeSessionPRMarks([W1, W2], [owned], 75)).toHaveLength(0);
  });

  it('rep PR: more reps at a known load, without a new e1RM record', () => {
    const s1 = mkWorkout('s1', '2026-10-26', [mkSet({ weight: 120, reps: 1 }), mkSet({ weight: 100, reps: 5 })]);
    const s2 = mkWorkout('s2', '2026-11-02', [mkSet({ weight: 100, reps: 6 })]);
    const marks = computeSessionPRMarks([s1, s2], [], 75);
    const repMark = marks.find((m) => m.workoutId === 's2');
    expect(repMark).toMatchObject({ kind: 'reps', weightKg: 100, reps: 6 });
    expect(isPRSet(marks, 's2', 'Bench Press', s2.exercises[0].sets[0])).toBe(true);
  });

  it('warmup and unfinished sets are never PR sets', () => {
    const w = mkWorkout('wk9', '2026-10-26', [
      mkSet({ weight: 100, isWarmup: true }),
      mkSet({ weight: 90, status: 'not_attempted' }),
    ]);
    const marks = computeSessionPRMarks([w], [], 75);
    expect(marks).toHaveLength(0);
    expect(isPRSet(marks, 'wk9', 'Bench Press', w.exercises[0].sets[0])).toBe(false);
  });
});

describe('store: set edits reconcile derived PRs (§23 stale-PR gap)', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  it('editing the PR set DOWN through updateWorkout removes the stale record', () => {
    useStore.setState({ workouts: [W1, W2], prs: [PR_BASE, PR_TOP] });
    useStore.getState().updateWorkout('wk2', {
      exercises: [{ name: 'Bench Press', sets: [mkSet({ weight: 90 })] }],
    });
    // 90×5 (105.0) no longer beats the 116.7 baseline — no wk2 record.
    expect(benchPRs().map((p) => p.id)).toEqual(['pr-base']);
  });

  it('editing a set UP mints the record the performance earns, dated on the workout', () => {
    useStore.setState({ workouts: [W1], prs: [PR_BASE] });
    useStore.getState().updateWorkout('wk1', {
      exercises: [{ name: 'Bench Press', sets: [mkSet({ weight: 110 })] }],
    });
    const prs = benchPRs();
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({ weightKg: 110, oneRepMax: 128.3, date: '2026-10-26' });
  });

  it('manual records survive set edits untouched', () => {
    useStore.setState({ workouts: [W1, W2], prs: [PR_BASE, PR_TOP, PR_MANUAL] });
    useStore.getState().updateWorkout('wk2', {
      exercises: [{ name: 'Bench Press', sets: [mkSet({ weight: 90 })] }],
    });
    expect(benchPRs().find((p) => p.id === 'pr-manual')).toEqual(PR_MANUAL);
  });

  it('delete → undo → delete again converges (chained undo)', () => {
    useStore.setState({ workouts: [W1, W2], prs: [PR_BASE, PR_TOP] });
    useStore.getState().deleteWorkout('wk2');
    expect(benchPRs()).toHaveLength(1);
    useStore.getState().insertWorkoutAt(W2, 1);
    const restored = benchPRs();
    expect(restored).toHaveLength(2);
    expect(restored.map((p) => p.oneRepMax).sort()).toEqual([116.7, 128.3]);
    useStore.getState().deleteWorkout('wk2');
    expect(benchPRs()).toHaveLength(1);
  });
});

describe('baselines: one field (§23)', () => {
  it('the persist migration backfills the flag from the legacy notes encoding', () => {
    const migrated = migratePersistedState(
      {
        prs: [
          { ...PR_BASE, id: 'a' }, // notes-only baseline (every pre-3.1 record)
          { ...PR_TOP, id: 'b', isBaseline: true, notes: 'renamed by user' }, // flag-only
          { ...PR_TOP, id: 'c' }, // not a baseline
          { ...PR_MANUAL, id: 'd' },
        ],
      },
      3,
    ) as any;
    const byId = Object.fromEntries(migrated.prs.map((p: any) => [p.id, p.isBaseline]));
    expect(byId).toEqual({ a: true, b: true, c: undefined, d: undefined });
  });

  it('isBaselinePR reads the flag only (writers + migration guarantee it)', () => {
    expect(isBaselinePR({ ...PR_BASE, isBaseline: true })).toBe(true);
    expect(isBaselinePR(PR_BASE)).toBe(false); // notes alone no longer count
    expect(isBaselinePR(PR_TOP)).toBe(false);
  });

  it('a baseline minted by the replay carries the flag, not just the note', () => {
    useStore.getState().clearAllData();
    useStore.setState({ workouts: [], prs: [] });
    useStore.getState().insertWorkoutAt(W1, 0);
    const prs = benchPRs();
    expect(prs).toHaveLength(1);
    expect(prs[0].isBaseline).toBe(true);
    expect(prs[0].notes).toBe('Baseline established from first session');
  });
});
