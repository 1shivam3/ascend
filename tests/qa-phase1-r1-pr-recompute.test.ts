import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../src/lib/store';
import { isDerivedPR } from '../src/lib/pr-reevaluation';
import type { PersonalRecord, WorkoutEntry, WorkoutSet } from '../src/lib/types';

// QA-hardening R1 — stale PRs after history changes.
//
// Before this fix, deleteWorkout never touched state.prs: the record
// outlived the performance that earned it (Library: "No history
// logged" beside a standing PR). Derived records (auto-minted at
// finish) now recompute from remaining history on delete and on Undo;
// user-owned records (Record Personal Best modal, CSV import) persist.

const mkSet = (over: Partial<WorkoutSet> = {}): WorkoutSet => ({
  reps: 5,
  weight: 100,
  unit: 'kg',
  completed: true,
  status: 'completed',
  ...over,
});

const mkWorkout = (id: string, date: string, weight: number): WorkoutEntry => ({
  id,
  date,
  name: 'Upper A',
  exercises: [{ name: 'Bench Press', sets: [mkSet({ weight })] }],
});

// W1 2026-10-26: 100×5 → e1RM 116.7 (baseline). W2 2026-11-02: 110×5 → 128.3.
const W1 = mkWorkout('wk1', '2026-10-26', 100);
const W2 = mkWorkout('wk2', '2026-11-02', 110);

const PR_BASE: PersonalRecord = {
  id: 'pr-base',
  exercise: 'Bench Press',
  weightKg: 100,
  weightLbs: 220.5,
  reps: 5,
  oneRepMax: 116.7,
  date: '2026-10-26',
  notes: 'Baseline established from first session',
  prType: '1rm',
};
const PR_TOP: PersonalRecord = {
  id: 'pr-top',
  exercise: 'Bench Press',
  weightKg: 110,
  weightLbs: 242.5,
  reps: 5,
  oneRepMax: 128.3,
  date: '2026-11-02',
  notes: 'All-Time 1RM PR',
  prType: '1rm',
};
const PR_MANUAL: PersonalRecord = {
  id: 'pr-manual',
  exercise: 'Bench Press',
  weightKg: 120,
  weightLbs: 264.6,
  reps: 3,
  oneRepMax: 132,
  date: '2026-11-03',
  notes: 'Tested at the gym meet',
};
const PR_IMPORTED: PersonalRecord = {
  id: 'pr-imported',
  exercise: 'Bench Press',
  weightKg: 90,
  weightLbs: 198.4,
  reps: 8,
  oneRepMax: 114.3,
  date: '2026-10-20',
  notes: 'Imported from workout history CSV',
};

const benchPRs = () =>
  useStore
    .getState()
    .prs.filter((p) => p.exercise === 'Bench Press')
    .sort((a, b) => (a.date < b.date ? -1 : 1));

describe('QA R1 — derived PR recompute after history changes', () => {
  beforeEach(() => {
    useStore.getState().clearAllData();
  });

  it('classification: finish-path notes are derived; manual/import notes are user-owned', () => {
    expect(isDerivedPR(PR_BASE)).toBe(true);
    expect(isDerivedPR(PR_TOP)).toBe(true);
    expect(isDerivedPR({ ...PR_TOP, id: 'x', notes: 'Auto-detected from workout session', prType: undefined })).toBe(true);
    expect(isDerivedPR({ ...PR_TOP, id: 'x', notes: 'Rep PR: 100.0 kg × 8', prType: 'reps' })).toBe(true);
    expect(isDerivedPR(PR_MANUAL)).toBe(false);
    expect(isDerivedPR(PR_IMPORTED)).toBe(false);
    expect(isDerivedPR({ ...PR_MANUAL, notes: undefined })).toBe(false);
  });

  it('deleting the PR workout falls the record back to the next-best remaining performance', () => {
    useStore.setState({ workouts: [W1, W2], prs: [PR_BASE, PR_TOP] });
    useStore.getState().deleteWorkout('wk2');
    const prs = benchPRs();
    expect(prs.map((p) => p.id)).toEqual(['pr-base']);
    expect(prs[0].oneRepMax).toBe(116.7);
    // The deletion is tombstoned for sync, like an explicit PR delete.
    expect(useStore.getState().deletedPrIds).toContain('pr-top');
  });

  it('deleting the only workout removes its derived PR (incl. Log Past auto-detected records)', () => {
    const autoPR: PersonalRecord = {
      id: 'pr-auto-logged',
      exercise: 'Bench Press',
      weightKg: 100,
      weightLbs: 220.5,
      reps: 5,
      oneRepMax: 116.7,
      date: '2026-10-26',
      notes: 'Auto-detected from workout session',
    };
    useStore.setState({ workouts: [W1], prs: [autoPR] });
    useStore.getState().deleteWorkout('wk1');
    expect(benchPRs()).toEqual([]);
  });

  it('Undo restores the deleted workout’s PR with the same values', () => {
    useStore.setState({ workouts: [W1, W2], prs: [PR_BASE, PR_TOP] });
    useStore.getState().deleteWorkout('wk2');
    expect(benchPRs().map((p) => p.id)).toEqual(['pr-base']);
    useStore.getState().insertWorkoutAt(W2, 1);
    const prs = benchPRs();
    expect(prs).toHaveLength(2);
    expect(prs[1]).toMatchObject({
      weightKg: 110,
      reps: 5,
      oneRepMax: 128.3,
      date: '2026-11-02',
      prType: '1rm',
    });
    // And its tombstone is cleared so the next sync keeps it.
    expect(useStore.getState().deletedPrIds).not.toContain(prs[1].id);
  });

  it('delete → undo → delete → undo is stable: same ids, no duplicates', () => {
    useStore.setState({ workouts: [W1, W2], prs: [PR_BASE, PR_TOP] });
    const s = useStore.getState();
    s.deleteWorkout('wk2');
    s.insertWorkoutAt(W2, 1);
    const afterFirstCycle = benchPRs().map((p) => `${p.id}:${p.oneRepMax}`);
    s.deleteWorkout('wk2');
    expect(benchPRs().map((p) => p.id)).toEqual(['pr-base']);
    s.insertWorkoutAt(W2, 1);
    expect(benchPRs().map((p) => `${p.id}:${p.oneRepMax}`)).toEqual(afterFirstCycle);
    expect(benchPRs()).toHaveLength(2);
  });

  it('chained deletes and chained undos converge to the full record set', () => {
    useStore.setState({ workouts: [W1, W2], prs: [PR_BASE, PR_TOP] });
    const s = useStore.getState();
    s.deleteWorkout('wk2');
    s.deleteWorkout('wk1');
    expect(benchPRs()).toEqual([]);
    s.insertWorkoutAt(W1, 0);
    expect(benchPRs().map((p) => p.oneRepMax)).toEqual([116.7]);
    s.insertWorkoutAt(W2, 1);
    expect(benchPRs().map((p) => p.oneRepMax)).toEqual([116.7, 128.3]);
  });

  it('a manual PR survives wiping the exercise’s whole logged history', () => {
    useStore.setState({ workouts: [W1, W2], prs: [PR_BASE, PR_TOP, PR_MANUAL] });
    const s = useStore.getState();
    s.deleteWorkout('wk2');
    s.deleteWorkout('wk1');
    expect(benchPRs().map((p) => p.id)).toEqual(['pr-manual']);
  });

  it('a CSV-imported PR is user-owned and survives history deletion', () => {
    useStore.setState({ workouts: [W1], prs: [PR_BASE, PR_IMPORTED] });
    useStore.getState().deleteWorkout('wk1');
    expect(benchPRs().map((p) => p.id)).toEqual(['pr-imported']);
  });
});
